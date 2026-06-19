using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Backend.Services
{
    public interface ITranslationService
    {
        Task<string> TranslateAsync(string text, string targetLanguageCode);
    }

    public class TranslationService : ITranslationService
    {
        private readonly HttpClient _httpClient;
        private readonly IConfiguration _configuration;
        private readonly ILogger<TranslationService> _logger;

        public TranslationService(HttpClient httpClient, IConfiguration configuration, ILogger<TranslationService> logger)
        {
            _httpClient = httpClient;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task<string> TranslateAsync(string text, string targetLanguageCode)
        {
            if (string.IsNullOrWhiteSpace(text))
                return string.Empty;

            var provider = _configuration["Translation:Provider"] ?? "Gemini";
            _logger.LogInformation("Using translation provider: {Provider} for language: {Lang}", provider, targetLanguageCode);

            if (provider.Equals("DeepL", StringComparison.OrdinalIgnoreCase))
            {
                return await TranslateWithDeepLAsync(text, targetLanguageCode);
            }
            else
            {
                return await TranslateWithGeminiAsync(text, targetLanguageCode);
            }
        }

        private async Task<string> TranslateWithDeepLAsync(string text, string targetLanguageCode)
        {
            var apiKey = _configuration["DeepL:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey) || apiKey.Contains("YOUR_DEEPL_API_KEY"))
            {
                _logger.LogWarning("DeepL API Key is missing or placeholder. Returning original text.");
                return text;
            }

            // Map target language code for DeepL (expects uppercase)
            string targetLang = targetLanguageCode.ToUpper() switch
            {
                "EN" => "EN-US",
                "JA" => "JA",
                "KO" => "KO",
                "ZH" => "ZH",
                "FR" => "FR",
                _ => targetLanguageCode.ToUpper()
            };

            try
            {
                var isPro = _configuration.GetValue<bool>("DeepL:IsPro");
                var baseUrl = isPro ? "https://api.deepl.com" : "https://api-free.deepl.com";
                var requestUrl = $"{baseUrl}/v2/translate";

                using var request = new HttpRequestMessage(HttpMethod.Post, requestUrl);
                request.Headers.Add("Authorization", $"DeepL-Auth-Key {apiKey}");
                
                var requestBody = new
                {
                    text = new[] { text },
                    target_lang = targetLang
                };

                var jsonRequest = JsonSerializer.Serialize(requestBody);
                request.Content = new StringContent(jsonRequest, Encoding.UTF8, "application/json");

                var response = await _httpClient.SendAsync(request);
                response.EnsureSuccessStatusCode();

                var jsonResponse = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(jsonResponse);
                var root = doc.RootElement;
                if (root.TryGetProperty("translations", out var translations) && 
                    translations.GetArrayLength() > 0)
                {
                    var translatedText = translations[0].GetProperty("text").GetString()?.Trim();
                    return translatedText ?? text;
                }

                _logger.LogWarning("Unexpected response format from DeepL. Response: {Response}", jsonResponse);
                return text;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during DeepL translation to {Lang}", targetLang);
                return text;
            }
        }

        private async Task<string> TranslateWithGeminiAsync(string text, string targetLanguageCode)
        {
            var apiKey = _configuration["Gemini:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey) || apiKey.Contains("YOUR_GEMINI_API_KEY"))
            {
                _logger.LogWarning("Gemini API Key is missing or placeholder. Returning original text.");
                return text;
            }

            string languageName = targetLanguageCode.ToLower() switch
            {
                "en" => "English",
                "ja" => "Japanese",
                "ko" => "Korean",
                "zh" => "Chinese",
                "fr" => "French",
                _ => targetLanguageCode
            };

            int maxRetries = 3;
            int delayMs = 2000;
            
            for (int attempt = 0; attempt < maxRetries; attempt++)
            {
                try
                {
                    var requestUrl = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={apiKey}";

                    var prompt = $"You are a professional travel and food translator. Translate the following Vietnamese text about street food stalls into {languageName}. Keep the translation natural, engaging for tourists, and preserve names of dishes if they are unique (e.g. keep 'Ốc' or explain it in parentheses). Return ONLY the translated text without any conversational intro/outro or markdown wrappers.\n\nText to translate:\n{text}";

                    var requestBody = new
                    {
                        contents = new[]
                        {
                            new
                            {
                                parts = new[]
                                {
                                    new { text = prompt }
                                }
                            }
                        }
                    };

                    var jsonRequest = JsonSerializer.Serialize(requestBody);
                    var content = new StringContent(jsonRequest, Encoding.UTF8, "application/json");

                    var response = await _httpClient.PostAsync(requestUrl, content);
                    
                    if ((int)response.StatusCode == 429)
                    {
                        _logger.LogWarning("Gemini API returned 429 (Too Many Requests). Retrying in {Delay}ms... (Attempt {Attempt}/{Max})", delayMs, attempt + 1, maxRetries);
                        await Task.Delay(delayMs);
                        delayMs *= 2; // Exponential backoff
                        continue;
                    }
                    
                    response.EnsureSuccessStatusCode();

                    var jsonResponse = await response.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(jsonResponse);
                    
                    var root = doc.RootElement;
                    if (root.TryGetProperty("candidates", out var candidates) && 
                        candidates.GetArrayLength() > 0 &&
                        candidates[0].TryGetProperty("content", out var candidateContent) &&
                        candidateContent.TryGetProperty("parts", out var parts) &&
                        parts.GetArrayLength() > 0)
                    {
                        var translatedText = parts[0].GetProperty("text").GetString()?.Trim();
                        return translatedText ?? text;
                    }

                    _logger.LogWarning("Unexpected response format from Gemini API. Response: {Response}", jsonResponse);
                    return text;
                }
                catch (Exception ex)
                {
                    if (attempt == maxRetries - 1)
                    {
                        _logger.LogError(ex, "Error occurred during Gemini translation to {Lang} after all retries.", targetLanguageCode);
                        return text;
                    }
                    _logger.LogWarning(ex, "Error during Gemini translation (Attempt {Attempt}/{Max}). Retrying in {Delay}ms...", attempt + 1, maxRetries, delayMs);
                    await Task.Delay(delayMs);
                    delayMs *= 2;
                }
            }
            return text;
        }
    }
}

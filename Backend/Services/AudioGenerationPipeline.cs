using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Backend.Data;
using Backend.Models;

namespace Backend.Services
{
    public interface IAudioGenerationPipeline
    {
        Task<Localization> ProcessStallLocalizationAsync(Guid foodStallId, string targetLanguageCode);
    }

    public class AudioGenerationPipeline : IAudioGenerationPipeline
    {
        private readonly AppDbContext _dbContext;
        private readonly ITranslationService _translationService;
        private readonly IEdgeTtsService _edgeTtsService;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<AudioGenerationPipeline> _logger;
        private string WebRootPath => _env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot");

        public AudioGenerationPipeline(
            AppDbContext dbContext,
            ITranslationService translationService,
            IEdgeTtsService edgeTtsService,
            IWebHostEnvironment env,
            ILogger<AudioGenerationPipeline> logger)
        {
            _dbContext = dbContext;
            _translationService = translationService;
            _edgeTtsService = edgeTtsService;
            _env = env;
            _logger = logger;
        }

        public async Task<Localization> ProcessStallLocalizationAsync(Guid foodStallId, string targetLanguageCode)
        {
            targetLanguageCode = targetLanguageCode.Trim().ToLower();
            
            var stall = await _dbContext.FoodStalls.FindAsync(foodStallId);
            if (stall == null)
            {
                throw new ArgumentException($"FoodStall with ID {foodStallId} not found.");
            }

            _logger.LogInformation("Processing audio generation pipeline for stall '{Name}' in language '{Lang}'", stall.Name, targetLanguageCode);

            // Step 1: Compute MD5 Hash of the Source Text (OriginalHistory)
            var sourceHash = ComputeMd5Hash(stall.OriginalHistory);

            // Check if localization already exists for this stall and language
            var existingLoc = await _dbContext.Localizations
                .FirstOrDefaultAsync(l => l.FoodStallId == foodStallId && l.LanguageCode == targetLanguageCode);

            // Step 2: Compare Hash of Source Text & check if MP3 exists
            if (existingLoc != null && existingLoc.TextHash == sourceHash && FileExistsOnServer(existingLoc.AudioUrl))
            {
                _logger.LogInformation("Source hash matches and MP3 exists. Reusing cached translation and audio for stall '{Name}' in language '{Lang}'", stall.Name, targetLanguageCode);
                return existingLoc;
            }

            // Step 3: Translate via AI (Gemini)
            var translatedText = stall.OriginalHistory;
            if (targetLanguageCode != "vi")
            {
                translatedText = await _translationService.TranslateAsync(stall.OriginalHistory, targetLanguageCode);
            }

            // Step 4: Synthesize Audio (Edge-TTS)
            _logger.LogInformation("Generating new MP3 audio for stall '{Name}' in language '{Lang}'", stall.Name, targetLanguageCode);
            var audioBytes = await _edgeTtsService.SynthesizeAsync(translatedText, targetLanguageCode);

            // Step 5: Save MP3 File to wwwroot
            var fileName = $"{foodStallId}_{targetLanguageCode}.mp3";
            var audioDir = Path.Combine(WebRootPath, "audio");
            if (!Directory.Exists(audioDir))
            {
                Directory.CreateDirectory(audioDir);
            }

            var filePath = Path.Combine(audioDir, fileName);
            await File.WriteAllBytesAsync(filePath, audioBytes);

            // Create server URL (e.g. /audio/stallid_language.mp3)
            var audioUrl = $"/audio/{fileName}";

            // Step 6: Upsert Localization in DB
            if (existingLoc == null)
            {
                existingLoc = new Localization
                {
                    Id = Guid.NewGuid(),
                    FoodStallId = foodStallId,
                    LanguageCode = targetLanguageCode,
                    TranslatedText = translatedText,
                    TextHash = sourceHash, // Store the source text hash!
                    AudioUrl = audioUrl
                };
                _dbContext.Localizations.Add(existingLoc);
            }
            else
            {
                existingLoc.TranslatedText = translatedText;
                existingLoc.TextHash = sourceHash; // Store the source text hash!
                existingLoc.AudioUrl = audioUrl;
                _dbContext.Entry(existingLoc).State = EntityState.Modified;
            }

            await _dbContext.SaveChangesAsync();
            _logger.LogInformation("Upserted localization and saved audio at URL '{Url}' for stall '{Name}'", audioUrl, stall.Name);

            return existingLoc;
        }

        private string ComputeMd5Hash(string input)
        {
            byte[] inputBytes = Encoding.UTF8.GetBytes(input);
            byte[] hashBytes = MD5.HashData(inputBytes);

            var sb = new StringBuilder();
            foreach (var b in hashBytes)
            {
                sb.Append(b.ToString("x2"));
            }
            return sb.ToString();
        }

        private bool FileExistsOnServer(string relativeUrl)
        {
            if (string.IsNullOrWhiteSpace(relativeUrl)) return false;
            
            var cleanPath = relativeUrl.TrimStart('/');
            var fullPath = Path.Combine(WebRootPath, cleanPath);
            return File.Exists(fullPath);
        }
    }
}

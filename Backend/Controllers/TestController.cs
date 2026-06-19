using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TestController : ControllerBase
    {
        private readonly IEdgeTtsService _edgeTtsService;
        private readonly IWebHostEnvironment _env;

        public TestController(IEdgeTtsService edgeTtsService, IWebHostEnvironment env)
        {
            _edgeTtsService = edgeTtsService;
            _env = env;
        }

        [HttpGet("tts")]
        public async Task<IActionResult> TestTts([FromQuery] string text = "Chào mừng bạn đến với phố ẩm thực Vĩnh Khánh Quận 4!", [FromQuery] string lang = "vi")
        {
            try
            {
                var audioBytes = await _edgeTtsService.SynthesizeAsync(text, lang);
                
                var wwwroot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot");
                if (!Directory.Exists(wwwroot))
                {
                    Directory.CreateDirectory(wwwroot);
                }

                var outputPath = Path.Combine(wwwroot, "test.mp3");
                await System.IO.File.WriteAllBytesAsync(outputPath, audioBytes);

                return Ok(new
                {
                    Success = true,
                    Message = "TTS generated successfully.",
                    LengthBytes = audioBytes.Length,
                    OutputFile = "/test.mp3",
                    Path = outputPath
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    Success = false,
                    Error = ex.Message,
                    Details = ex.ToString()
                });
            }
        }
    }
}

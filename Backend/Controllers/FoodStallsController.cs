using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Services;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class FoodStallsController : ControllerBase
    {
        private readonly AppDbContext _dbContext;
        private readonly IAudioGenerationPipeline _audioPipeline;

        // Supported languages for offline packages
        private static readonly string[] SupportedLanguages = { "vi", "en", "ja", "ko" };

        public FoodStallsController(AppDbContext dbContext, IAudioGenerationPipeline audioPipeline)
        {
            _dbContext = dbContext;
            _audioPipeline = audioPipeline;
        }

        // 1. Synchronize Endpoint for Mobile Clients
        [HttpGet("sync")]
        public async Task<IActionResult> Sync([FromQuery] string lang = "en")
        {
            lang = lang.Trim().ToLower();

            var stalls = await _dbContext.FoodStalls.ToListAsync();
            var result = new List<object>();

            foreach (var stall in stalls)
            {
                // Ensure the localization and audio exist for this language
                Localization? loc = null;
                try
                {
                    loc = await _audioPipeline.ProcessStallLocalizationAsync(stall.Id, lang);
                }
                catch (Exception)
                {
                    // Fallback to original text if pipeline fails
                    loc = new Localization
                    {
                        FoodStallId = stall.Id,
                        LanguageCode = lang,
                        TranslatedText = stall.OriginalHistory,
                        AudioUrl = string.Empty
                    };
                }

                result.Add(new
                {
                    stall.Id,
                    stall.Name,
                    stall.Address,
                    stall.Latitude,
                    stall.Longitude,
                    stall.OriginalHistory,
                    Translation = new
                    {
                        loc.TranslatedText,
                        loc.AudioUrl
                    }
                });
            }

            return Ok(new { stalls = result });
        }

        // 2. GET All (Admin/Web view)
        [HttpGet]
        public async Task<ActionResult<IEnumerable<FoodStall>>> GetFoodStalls()
        {
            return await _dbContext.FoodStalls.ToListAsync();
        }

        // 3. GET Single Stall
        [HttpGet("{id}")]
        public async Task<ActionResult<FoodStall>> GetFoodStall(Guid id)
        {
            var foodStall = await _dbContext.FoodStalls.FindAsync(id);
            if (foodStall == null) return NotFound();
            return foodStall;
        }

        // 4. POST Create Stall (Triggers Audio Generation Pipeline)
        [HttpPost]
        public async Task<ActionResult<FoodStall>> PostFoodStall(FoodStall stall)
        {
            if (stall.Id == Guid.Empty) stall.Id = Guid.NewGuid();

            _dbContext.FoodStalls.Add(stall);
            await _dbContext.SaveChangesAsync();

            // Pre-generate audio for all supported languages in the background
            // so they are ready immediately for offline downloads
            _ = Task.Run(async () =>
            {
                foreach (var lang in SupportedLanguages)
                {
                    try
                    {
                        await _audioPipeline.ProcessStallLocalizationAsync(stall.Id, lang);
                    }
                    catch (Exception)
                    {
                        // Log and ignore to prevent background thread crash
                    }
                }
            });

            return CreatedAtAction(nameof(GetFoodStall), new { id = stall.Id }, stall);
        }

        // 5. PUT Update Stall
        [HttpPut("{id}")]
        public async Task<IActionResult> PutFoodStall(Guid id, FoodStall stall)
        {
            if (id != stall.Id) return BadRequest();

            _dbContext.Entry(stall).State = EntityState.Modified;

            try
            {
                await _dbContext.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!FoodStallExists(id)) return NotFound();
                throw;
            }

            // Regenerate translation/audio since history/info might have changed
            _ = Task.Run(async () =>
            {
                foreach (var lang in SupportedLanguages)
                {
                    try
                    {
                        await _audioPipeline.ProcessStallLocalizationAsync(stall.Id, lang);
                    }
                    catch (Exception)
                    {
                        // Log and ignore
                    }
                }
            });

            return NoContent();
        }

        // 6. DELETE Stall
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteFoodStall(Guid id)
        {
            var foodStall = await _dbContext.FoodStalls.FindAsync(id);
            if (foodStall == null) return NotFound();

            // Delete associated localizations
            var localizations = await _dbContext.Localizations.Where(l => l.FoodStallId == id).ToListAsync();
            _dbContext.Localizations.RemoveRange(localizations);

            _dbContext.FoodStalls.Remove(foodStall);
            await _dbContext.SaveChangesAsync();

            return NoContent();
        }

        private bool FoodStallExists(Guid id)
        {
            return _dbContext.FoodStalls.Any(e => e.Id == id);
        }
    }
}

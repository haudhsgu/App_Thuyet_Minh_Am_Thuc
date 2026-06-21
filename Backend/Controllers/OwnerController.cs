using System;
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
    public class OwnerController : ControllerBase
    {
        private readonly AppDbContext _dbContext;

        public OwnerController(AppDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        // 1. GET Owner's Food Stalls
        [HttpGet("pois")]
        public async Task<IActionResult> GetMyStalls()
        {
            var owner = await GetOwnerUserAsync();
            if (owner == null) return Unauthorized("Stall Owner authorization required.");

            var stalls = await _dbContext.FoodStalls
                .Where(s => s.OwnerId == owner.Id)
                .ToListAsync();

            return Ok(stalls);
        }

        // 2. PUT Update Owner's Stall (Requires Admin approval before showing on public PWA)
        [HttpPut("pois/{id}")]
        public async Task<IActionResult> UpdateStall(Guid id, [FromBody] FoodStall update)
        {
            var owner = await GetOwnerUserAsync();
            if (owner == null) return Unauthorized("Stall Owner authorization required.");

            var stall = await _dbContext.FoodStalls.FindAsync(id);
            if (stall == null) return NotFound("Stall not found.");

            // Verification check: owner owns this stall
            if (stall.OwnerId != owner.Id) return Unauthorized("Access denied. You do not own this stall.");

            stall.Name = update.Name;
            stall.Address = update.Address;
            stall.Latitude = update.Latitude;
            stall.Longitude = update.Longitude;
            stall.OriginalHistory = update.OriginalHistory;
            
            // Mark as unverified so admin must approve the new details/audio changes
            stall.IsVerified = false;
            stall.AdminNote = "Chờ Admin duyệt thuyết minh mới.";

            _dbContext.Entry(stall).State = EntityState.Modified;
            await _dbContext.SaveChangesAsync();

            // Log action in Telemetry for Audit
            _dbContext.UserTelemetries.Add(new UserTelemetry
            {
                Id = Guid.NewGuid(),
                UserId = owner.Id,
                Timestamp = DateTime.UtcNow,
                Latitude = update.Latitude,
                Longitude = update.Longitude,
                Action = $"UPDATE_POI_SUBMISSION: {update.Name}"
            });
            await _dbContext.SaveChangesAsync();

            return Ok(new { success = true, message = "Cập nhật thành công. Đang chờ Admin phê duyệt để hiển thị lên bản đồ.", stall });
        }

        // 3. GET Owner's Notifications
        [HttpGet("notifications")]
        public async Task<IActionResult> GetNotifications()
        {
            var owner = await GetOwnerUserAsync();
            if (owner == null) return Unauthorized("Stall Owner authorization required.");

            var list = await _dbContext.Notifications
                .Where(n => n.UserId == owner.Id)
                .OrderByDescending(n => n.CreatedAt)
                .ToListAsync();

            // Mark notifications as read after fetching
            if (list.Any(n => !n.IsRead))
            {
                foreach (var item in list.Where(n => !n.IsRead))
                {
                    item.IsRead = true;
                    _dbContext.Entry(item).State = EntityState.Modified;
                }
                await _dbContext.SaveChangesAsync();
            }

            return Ok(list);
        }

        private async Task<User?> GetOwnerUserAsync()
        {
            var authHeader = Request.Headers["Authorization"].ToString();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                return null;

            var token = authHeader.Substring("Bearer ".Length).Trim();
            var session = await _dbContext.UserSessions
                .FirstOrDefaultAsync(s => s.Token == token && s.ExpiresAt > DateTime.UtcNow);

            if (session == null)
                return null;

            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == session.UserId);
            if (user?.Role != "Owner")
                return null;

            return user;
        }
    }
}

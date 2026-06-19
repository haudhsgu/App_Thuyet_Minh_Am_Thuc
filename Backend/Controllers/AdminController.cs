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
    public class AdminController : ControllerBase
    {
        private readonly AppDbContext _dbContext;
        private readonly IAudioGenerationPipeline _audioPipeline;
        private static readonly string[] SupportedLanguages = { "vi", "en", "ja", "ko" };

        public AdminController(AppDbContext dbContext, IAudioGenerationPipeline audioPipeline)
        {
            _dbContext = dbContext;
            _audioPipeline = audioPipeline;
        }

        // 1. GET Dashboard Metrics
        [HttpGet("metrics")]
        public async Task<IActionResult> GetMetrics()
        {
            var admin = await GetAdminUserAsync();
            if (admin == null) return Unauthorized("Admin privileges required.");

            var totalStalls = await _dbContext.FoodStalls.CountAsync();
            var totalUsers = await _dbContext.Users.CountAsync(u => u.Role == "Owner" || u.Role == "Public");
            
            // Active users are users whose LastActive is within the last 5 minutes
            var activeThreshold = DateTime.UtcNow.AddMinutes(-5);
            var activeUsersCount = await _dbContext.Users.CountAsync(u => u.LastActive >= activeThreshold);

            return Ok(new
            {
                totalStalls,
                totalUsers,
                activeUsers = activeUsersCount
            });
        }

        // 2. GET Owner Registrations (Pending or All)
        [HttpGet("registrations")]
        public async Task<IActionResult> GetRegistrations()
        {
            var admin = await GetAdminUserAsync();
            if (admin == null) return Unauthorized("Admin privileges required.");

            var regs = await _dbContext.OwnerRegistrations
                .Include(r => r.User)
                .OrderByDescending(r => r.CreatedAt)
                .ToListAsync();

            var result = regs.Select(r => new
            {
                r.Id,
                r.UserId,
                Username = r.User?.Username,
                r.FullName,
                Cccd = EncryptionHelper.DecryptCccd(r.CccdEncrypted), // Decrypt for admin review
                r.Status,
                r.CreatedAt,
                r.AdminNote
            });

            return Ok(result);
        }

        // 3. POST Approve Registration
        [HttpPost("registrations/{id}/approve")]
        public async Task<IActionResult> ApproveRegistration(Guid id, [FromBody] string adminNote)
        {
            var admin = await GetAdminUserAsync();
            if (admin == null) return Unauthorized("Admin privileges required.");

            var reg = await _dbContext.OwnerRegistrations.Include(r => r.User).FirstOrDefaultAsync(r => r.Id == id);
            if (reg == null) return NotFound("Registration not found.");

            reg.Status = "Approved";
            reg.AdminNote = adminNote;

            if (reg.User != null)
            {
                reg.User.IsVerified = true;
                reg.User.IsPoiOwnerVerified = true;
                _dbContext.Entry(reg.User).State = EntityState.Modified;

                // Send a notification to the owner
                _dbContext.Notifications.Add(new Notification
                {
                    Id = Guid.NewGuid(),
                    UserId = reg.UserId,
                    Message = "Tài khoản chủ quán của bạn đã được Admin phê duyệt! Bạn hiện có thể đăng nhập để quản lý.",
                    CreatedAt = DateTime.UtcNow
                });
            }

            // Also approve their registered stall automatically so it goes live initially
            var stall = await _dbContext.FoodStalls.FirstOrDefaultAsync(s => s.OwnerId == reg.UserId);
            if (stall != null)
            {
                stall.IsVerified = true;
                _dbContext.Entry(stall).State = EntityState.Modified;
            }

            await _dbContext.SaveChangesAsync();
            return Ok(new { success = true, message = "Owner registration approved successfully." });
        }

        // 4. POST Reject Registration
        [HttpPost("registrations/{id}/reject")]
        public async Task<IActionResult> RejectRegistration(Guid id, [FromBody] string adminNote)
        {
            var admin = await GetAdminUserAsync();
            if (admin == null) return Unauthorized("Admin privileges required.");

            var reg = await _dbContext.OwnerRegistrations.FirstOrDefaultAsync(r => r.Id == id);
            if (reg == null) return NotFound("Registration not found.");

            reg.Status = "Rejected";
            reg.AdminNote = adminNote;

            await _dbContext.SaveChangesAsync();
            return Ok(new { success = true, message = "Owner registration rejected successfully." });
        }

        // 5. GET Unverified Submissions (Stalls waiting for description approval)
        [HttpGet("submissions")]
        public async Task<IActionResult> GetSubmissions()
        {
            var admin = await GetAdminUserAsync();
            if (admin == null) return Unauthorized("Admin privileges required.");

            var pendingStalls = await _dbContext.FoodStalls
                .Where(s => !s.IsVerified && s.OwnerId != null)
                .ToListAsync();

            return Ok(pendingStalls);
        }

        // 6. POST Approve Stall Submission
        [HttpPost("submissions/{id}/approve")]
        public async Task<IActionResult> ApproveSubmission(Guid id, [FromBody] string adminNote)
        {
            var admin = await GetAdminUserAsync();
            if (admin == null) return Unauthorized("Admin privileges required.");

            var stall = await _dbContext.FoodStalls.FindAsync(id);
            if (stall == null) return NotFound("Stall not found.");

            stall.IsVerified = true;
            stall.AdminNote = adminNote;
            _dbContext.Entry(stall).State = EntityState.Modified;

            if (stall.OwnerId != null)
            {
                _dbContext.Notifications.Add(new Notification
                {
                    Id = Guid.NewGuid(),
                    UserId = stall.OwnerId.Value,
                    Message = $"Thuyết minh quán ăn '{stall.Name}' của bạn đã được duyệt thành công và hiển thị trên bản đồ!",
                    CreatedAt = DateTime.UtcNow
                });
            }

            await _dbContext.SaveChangesAsync();

            // Re-generate translations and TTS audio in background for all supported languages
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
                        // Ignore thread crash
                    }
                }
            });

            return Ok(new { success = true, message = "Stall submission approved successfully." });
        }

        // 7. POST Reject Stall Submission
        [HttpPost("submissions/{id}/reject")]
        public async Task<IActionResult> RejectSubmission(Guid id, [FromBody] string adminNote)
        {
            var admin = await GetAdminUserAsync();
            if (admin == null) return Unauthorized("Admin privileges required.");

            var stall = await _dbContext.FoodStalls.FindAsync(id);
            if (stall == null) return NotFound("Stall not found.");

            stall.AdminNote = adminNote;
            _dbContext.Entry(stall).State = EntityState.Modified;

            if (stall.OwnerId != null)
            {
                _dbContext.Notifications.Add(new Notification
                {
                    Id = Guid.NewGuid(),
                    UserId = stall.OwnerId.Value,
                    Message = $"Thuyết minh quán ăn '{stall.Name}' bị từ chối phê duyệt. Lý do: {adminNote}",
                    CreatedAt = DateTime.UtcNow
                });
            }

            await _dbContext.SaveChangesAsync();
            return Ok(new { success = true, message = "Stall submission rejected." });
        }

        // 8. GET Active Users Locations
        [HttpGet("active-users")]
        public async Task<IActionResult> GetActiveUsers()
        {
            var admin = await GetAdminUserAsync();
            if (admin == null) return Unauthorized("Admin privileges required.");

            var threshold = DateTime.UtcNow.AddMinutes(-5);
            
            // Get users who were active in last 5 minutes along with their last telemetry item
            var users = await _dbContext.Users
                .Where(u => u.LastActive >= threshold && u.Role != "Admin")
                .ToListAsync();

            var result = new System.Collections.Generic.List<object>();
            foreach (var user in users)
            {
                var lastTelemetry = await _dbContext.UserTelemetries
                    .Where(t => t.UserId == user.Id)
                    .OrderByDescending(t => t.Timestamp)
                    .FirstOrDefaultAsync();

                result.Add(new
                {
                    user.Id,
                    user.Username,
                    user.Role,
                    user.LastActive,
                    Latitude = lastTelemetry?.Latitude ?? 10.760124,
                    Longitude = lastTelemetry?.Longitude ?? 106.702958,
                    LastAction = lastTelemetry?.Action ?? "Online"
                });
            }

            return Ok(result);
        }

        // 9. GET Telemetry Audit Logs
        [HttpGet("telemetry")]
        public async Task<IActionResult> GetTelemetryLogs()
        {
            var admin = await GetAdminUserAsync();
            if (admin == null) return Unauthorized("Admin privileges required.");

            var logs = await _dbContext.UserTelemetries
                .Include(t => t.User)
                .OrderByDescending(t => t.Timestamp)
                .Take(100)
                .ToListAsync();

            var result = logs.Select(t => new
            {
                t.Id,
                Username = t.User?.Username ?? "Public User",
                Role = t.User?.Role ?? "Public",
                t.Timestamp,
                t.Latitude,
                t.Longitude,
                t.Action
            });

            return Ok(result);
        }

        // 10. POST Update PWA Client Heartbeat/Telemetry
        [HttpPost("heartbeat")]
        public async Task<IActionResult> Heartbeat([FromBody] HeartbeatRequest request)
        {
            if (string.IsNullOrEmpty(request.DeviceUniqueId))
                return BadRequest("Device ID required.");

            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.DeviceUniqueId == request.DeviceUniqueId);
            if (user == null)
            {
                user = new User
                {
                    Id = Guid.NewGuid(),
                    DeviceUniqueId = request.DeviceUniqueId,
                    Username = "user_" + Guid.NewGuid().ToString("N").Substring(0, 8),
                    Role = "Public",
                    IsVerified = true,
                    LastActive = DateTime.UtcNow
                };
                _dbContext.Users.Add(user);
            }
            else
            {
                user.LastActive = DateTime.UtcNow;
                _dbContext.Entry(user).State = EntityState.Modified;
            }

            // Create minor heartbeat telemetry log
            var telemetry = new UserTelemetry
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Timestamp = DateTime.UtcNow,
                Latitude = request.Latitude ?? 10.760124,
                Longitude = request.Longitude ?? 106.702958,
                Action = request.Action ?? "HEARTBEAT"
            };
            _dbContext.UserTelemetries.Add(telemetry);

            await _dbContext.SaveChangesAsync();
            return Ok(new { success = true });
        }

        public class HeartbeatRequest
        {
            public string DeviceUniqueId { get; set; } = string.Empty;
            public double? Latitude { get; set; }
            public double? Longitude { get; set; }
            public string? Action { get; set; }
        }

        private async Task<User?> GetAdminUserAsync()
        {
            var authHeader = Request.Headers["Authorization"].ToString();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                return null;

            var token = authHeader.Substring("Bearer ".Length).Trim();
            var session = await _dbContext.UserSessions
                .Include(s => s.User)
                .FirstOrDefaultAsync(s => s.Token == token && s.ExpiresAt > DateTime.UtcNow);

            if (session?.User?.Role != "Admin")
                return null;

            return session.User;
        }
    }
}

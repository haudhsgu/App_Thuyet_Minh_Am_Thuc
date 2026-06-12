using System;
using System.Linq;
using System.Security.Cryptography;
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
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _dbContext;

        public AuthController(AppDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public class RegisterOwnerRequest
        {
            public string Username { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
            public string FullName { get; set; } = string.Empty;
            public string Cccd { get; set; } = string.Empty; // Identity Card (PII)
            public string StallName { get; set; } = string.Empty;
            public string StallAddress { get; set; } = string.Empty;
            public double Latitude { get; set; }
            public double Longitude { get; set; }
            public string Description { get; set; } = string.Empty;
        }

        [HttpPost("register-owner")]
        public async Task<IActionResult> RegisterOwner([FromBody] RegisterOwnerRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest("Username and Password are required.");

            if (string.IsNullOrWhiteSpace(request.Cccd) || request.Cccd.Length < 9)
                return BadRequest("Valid CCCD (Identity Card) is required.");

            // Check if username already exists
            if (await _dbContext.Users.AnyAsync(u => u.Username.ToLower() == request.Username.ToLower()))
                return BadRequest("Username is already taken.");

            using (var transaction = await _dbContext.Database.BeginTransactionAsync())
            {
                try
                {
                    // 1. Create Owner User (unverified)
                    EncryptionHelper.HashPassword(request.Password, out string hash, out string salt);
                    var user = new User
                    {
                        Id = Guid.NewGuid(),
                        Username = request.Username,
                        PasswordHash = hash,
                        PasswordSalt = salt,
                        Role = "Owner",
                        IsVerified = false, // Must be approved by Admin
                        DeviceUniqueId = "owner_" + Guid.NewGuid().ToString("N").Substring(0, 12),
                        LastActive = DateTime.UtcNow
                    };
                    _dbContext.Users.Add(user);

                    // 2. Create Owner Registration Record (cccd encrypted)
                    var cccdEncrypted = EncryptionHelper.EncryptCccd(request.Cccd);
                    var registration = new OwnerRegistration
                    {
                        Id = Guid.NewGuid(),
                        UserId = user.Id,
                        FullName = request.FullName,
                        CccdEncrypted = cccdEncrypted,
                        Status = "Pending",
                        CreatedAt = DateTime.UtcNow
                    };
                    _dbContext.OwnerRegistrations.Add(registration);

                    // 3. Create FoodStall (associated to owner, unverified)
                    var stall = new FoodStall
                    {
                        Id = Guid.NewGuid(),
                        Name = request.StallName,
                        Address = request.StallAddress,
                        Latitude = request.Latitude,
                        Longitude = request.Longitude,
                        OriginalHistory = request.Description,
                        OwnerId = user.Id,
                        IsVerified = false // Must be approved by Admin
                    };
                    _dbContext.FoodStalls.Add(stall);

                    await _dbContext.SaveChangesAsync();
                    await transaction.CommitAsync();

                    return Ok(new { success = true, message = "Owner registration submitted successfully. Pending Admin approval." });
                }
                catch (Exception ex)
                {
                    await transaction.RollbackAsync();
                    return StatusCode(500, $"Internal server error: {ex.Message}");
                }
            }
        }

        public class LoginRequest
        {
            public string Username { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Username.ToLower() == request.Username.ToLower());
            if (user == null)
                return Unauthorized("Invalid username or password.");

            if (!EncryptionHelper.VerifyPassword(request.Password, user.PasswordHash, user.PasswordSalt))
                return Unauthorized("Invalid username or password.");

            if (!user.IsVerified)
                return Unauthorized("Your account is pending admin approval.");

            // Generate clean secure token session (24h validity)
            var tokenBytes = new byte[32];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(tokenBytes);
            }
            var token = Convert.ToHexString(tokenBytes);

            var session = new UserSession
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Token = token,
                ExpiresAt = DateTime.UtcNow.AddDays(1),
                CreatedAt = DateTime.UtcNow
            };

            _dbContext.UserSessions.Add(session);
            await _dbContext.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                token = token,
                user = new
                {
                    user.Id,
                    user.Username,
                    user.Role,
                    user.DeviceUniqueId
                }
            });
        }

        [HttpGet("me")]
        public async Task<IActionResult> GetMe()
        {
            var user = await GetCurrentUserAsync();
            if (user == null)
                return Unauthorized("Invalid or expired session token.");

            return Ok(new
            {
                user.Id,
                user.Username,
                user.Role,
                user.DeviceUniqueId,
                user.IsPoiOwnerVerified
            });
        }

        public class ChangePasswordRequest
        {
            public string OldPassword { get; set; } = string.Empty;
            public string NewPassword { get; set; } = string.Empty;
        }

        [HttpPost("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
        {
            var user = await GetCurrentUserAsync();
            if (user == null)
                return Unauthorized("Invalid session token.");

            if (!EncryptionHelper.VerifyPassword(request.OldPassword, user.PasswordHash, user.PasswordSalt))
                return BadRequest("Incorrect old password.");

            EncryptionHelper.HashPassword(request.NewPassword, out string hash, out string salt);
            user.PasswordHash = hash;
            user.PasswordSalt = salt;

            _dbContext.Entry(user).State = EntityState.Modified;
            await _dbContext.SaveChangesAsync();

            return Ok(new { success = true, message = "Password updated successfully." });
        }

        private async Task<User?> GetCurrentUserAsync()
        {
            var authHeader = Request.Headers["Authorization"].ToString();
            if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                return null;

            var token = authHeader.Substring("Bearer ".Length).Trim();
            var session = await _dbContext.UserSessions
                .Include(s => s.User)
                .FirstOrDefaultAsync(s => s.Token == token && s.ExpiresAt > DateTime.UtcNow);

            return session?.User;
        }
    }
}

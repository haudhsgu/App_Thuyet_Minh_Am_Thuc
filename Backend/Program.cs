using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Services;
using System;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddHttpClient();

// Database connection (PostgreSQL with SQLite fallback for local development)
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
var useSqlite = string.IsNullOrEmpty(connectionString) || connectionString.Contains("YOUR_CONNECTION_STRING");

if (useSqlite)
{
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlite("Data Source=StreetFoodQ4.db"));
}
else
{
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseNpgsql(connectionString!));
}

// Dependency Injection
builder.Services.AddScoped<ITranslationService, TranslationService>();
builder.Services.AddScoped<IEdgeTtsService, EdgeTtsService>();
builder.Services.AddScoped<IAudioGenerationPipeline, AudioGenerationPipeline>();

// Swagger/OpenAPI setup
builder.Services.AddOpenApi();

// Allow any origin for mobile testing
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("AllowAll");
app.UseHttpsRedirection();

// Serve static files (Crucial for MP3 downloads from wwwroot)
app.UseStaticFiles();

app.UseAuthorization();
app.MapControllers();

// Initialize Database & Seed Sample Data
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<AppDbContext>();

        // Auto-detect if database needs a rebuild by checking if a new table exists
        bool dbOk = false;
        try
        {
            _ = context.OwnerRegistrations.Any();
            dbOk = true;
        }
        catch
        {
            // Table doesn't exist, we need to rebuild
            Console.WriteLine("New database schema detected. Rebuilding database...");
        }

        if (!dbOk)
        {
            context.Database.EnsureDeleted();
            context.Database.EnsureCreated();
        }
        else
        {
            context.Database.EnsureCreated();
        }

        // Seed Default Admin User if not exists
        if (!context.Users.Any(u => u.Role == "Admin"))
        {
            EncryptionHelper.HashPassword("admin123", out string hash, out string salt);
            context.Users.Add(new Backend.Models.User
            {
                Id = Guid.NewGuid(),
                Username = "admin",
                PasswordHash = hash,
                PasswordSalt = salt,
                Role = "Admin",
                IsVerified = true,
                DeviceUniqueId = "admin_device",
                LastActive = DateTime.UtcNow
            });
            context.SaveChanges();
            Console.WriteLine("Admin user seeded successfully (admin / admin123).");
        }
        
        // Seed sample data for Vĩnh Khánh Street, District 4
        if (!context.FoodStalls.Any())
        {
            context.FoodStalls.AddRange(
                new Backend.Models.FoodStall
                {
                    Id = Guid.Parse("11111111-1111-1111-1111-111111111111"),
                    Name = "Ốc Oanh",
                    Address = "534 Vĩnh Khánh, Phường 8, Quận 4",
                    Latitude = 10.760124,
                    Longitude = 106.702958,
                    OriginalHistory = "Ốc Oanh là một trong những quán ốc nổi tiếng nhất Quận 4 trên đường Vĩnh Khánh. Quán nổi tiếng với các món ốc xào bơ tỏi, ốc hương rang muối ớt và các loại sò điệp nướng mỡ hành. Không gian quán ngoài trời đông đúc, nhộn nhịp đặc trưng ẩm thực đường phố Sài Gòn.",
                    IsVerified = true
                },
                new Backend.Models.FoodStall
                {
                    Id = Guid.Parse("22222222-2222-2222-2222-222222222222"),
                    Name = "Phá Lấu Bò Cô Thảo",
                    Address = "243/29G Tôn Đản, Phường 15, Quận 4",
                    Latitude = 10.758364,
                    Longitude = 106.705291,
                    OriginalHistory = "Phá lấu bò Cô Thảo là quán ăn lâu đời phục vụ món phá lấu bò truyền thống ăn kèm với bánh mì hoặc mì gói. Nước lèo béo thơm nước cốt dừa, lòng bò dai giòn sần sật ăn kèm nước mắm tắc chua ngọt đậm đà.",
                    IsVerified = true
                },
                new Backend.Models.FoodStall
                {
                    Id = Guid.Parse("33333333-3333-3333-3333-333333333333"),
                    Name = "Bánh Mì Kẹp Thịt nướng Cô Lệ",
                    Address = "104 Vĩnh Khánh, Phường 10, Quận 4",
                    Latitude = 10.761245,
                    Longitude = 106.700124,
                    OriginalHistory = "Bánh mì Cô Lệ nổi tiếng với những xiên thịt nướng được tẩm ướp đậm đà, nướng trực tiếp trên than hồng. Ổ bánh mì giòn rụm kẹp thịt nướng nóng hổi, dưa leo, đồ chua và nước sốt tương đặc trưng, thơm phức cả một góc phố.",
                    IsVerified = true
                }
            );
            context.SaveChanges();
            Console.WriteLine("Sample food stalls seeded successfully.");
        }
    }
    catch (Exception ex)
    {
        var logger = services.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "An error occurred while migrating or seeding the database.");
    }
}

app.Run();

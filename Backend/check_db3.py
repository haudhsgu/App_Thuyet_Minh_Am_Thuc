import sqlite3

db_path = "StreetFoodQ4.db"

try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT LanguageCode, COUNT(*) as cnt 
        FROM Localizations 
        WHERE TranslatedText IS NULL OR TranslatedText = '' 
        GROUP BY LanguageCode
    """)
    empty_by_lang = cursor.fetchall()
    
    print("Empty translations by language:")
    for row in empty_by_lang:
        print(f" - {row['LanguageCode']}: {row['cnt']}")

except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals():
        conn.close()

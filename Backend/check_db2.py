import sqlite3

db_path = "StreetFoodQ4.db"

try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as cnt FROM Localizations")
    count = cursor.fetchone()['cnt']
    print(f"Total Localizations: {count}")

    cursor.execute("SELECT COUNT(*) as cnt FROM Localizations WHERE TranslatedText IS NULL OR TranslatedText = ''")
    empty_trans = cursor.fetchone()['cnt']
    print(f"Empty translations: {empty_trans}")
    
    cursor.execute("SELECT COUNT(*) as cnt FROM Localizations WHERE AudioUrl IS NULL OR AudioUrl = ''")
    empty_audio = cursor.fetchone()['cnt']
    print(f"Empty AudioUrls: {empty_audio}")

except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals():
        conn.close()

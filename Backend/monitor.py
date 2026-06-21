import sqlite3
import time
import sys

db_path = 'StreetFoodQ4.db'

def get_stats():
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as cnt FROM Localizations WHERE TranslatedText IS NULL OR TranslatedText = ''")
    empty_trans = cursor.fetchone()['cnt']
    cursor.execute("SELECT COUNT(*) as cnt FROM Localizations WHERE AudioUrl IS NULL OR AudioUrl = ''")
    empty_audio = cursor.fetchone()['cnt']
    conn.close()
    return empty_trans, empty_audio

initial_trans, initial_audio = get_stats()
print(f"Starting with {initial_trans} empty translations and {initial_audio} empty audio files.")

while True:
    trans, audio = get_stats()
    if trans == 0 and audio == 0:
        print("All missing translations and audio files have been generated successfully!")
        break
    print(f"Waiting... Currently missing translations: {trans}, missing audio: {audio}")
    sys.stdout.flush()
    time.sleep(3)

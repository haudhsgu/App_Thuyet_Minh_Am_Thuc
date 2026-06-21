import sqlite3

db_path = "StreetFoodQ4.db"

try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print("Tables:", [t['name'] for t in tables])

    cursor.execute("SELECT Id, Name FROM FoodStalls")
    stalls = cursor.fetchall()
    print(f"Total Stalls: {len(stalls)}")

    cursor.execute("SELECT FoodStallId, LanguageCode FROM Localizations")
    localizations = cursor.fetchall()

    loc_map = {}
    for loc in localizations:
        stall_id = loc['FoodStallId']
        lang = loc['LanguageCode']
        if stall_id not in loc_map:
            loc_map[stall_id] = []
        loc_map[stall_id].append(lang)

    missing = []
    
    cursor.execute("SELECT DISTINCT LanguageCode FROM Localizations")
    all_langs = [r['LanguageCode'] for r in cursor.fetchall()]
    print(f"All languages found in DB: {all_langs}")
    
    # Actually the required languages are EN, JA, KO, ZH-CN as usually in standard translation sets, 
    # but I'll use the available languages. If the user expects standard languages like "en", "ja", "ko", "zh", I'll list missing among these.
    expected_langs = set(['en', 'ja', 'ko', 'zh'])
    all_langs_set = set(all_langs)
    if not expected_langs.issubset(all_langs_set):
         print(f"Expected languages {expected_langs} not fully present in DB. DB has {all_langs_set}")
    
    check_langs = list(all_langs_set.union(expected_langs))

    for stall in stalls:
        stall_id = stall['Id']
        name = stall['Name']
        langs = loc_map.get(stall_id, [])
        
        missing_langs = [l for l in check_langs if l not in langs]
        if missing_langs or not langs:
            missing.append({
                "Name": name,
                "Present": langs,
                "Missing": missing_langs
            })

    if not missing:
        print("All stalls have translations for all expected languages.")
    else:
        print(f"Found {len(missing)} stalls with missing translations:")
        for m in missing:
            print(f"- {m['Name']}: Present={m['Present']}, Missing={m['Missing']}")

except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals():
        conn.close()

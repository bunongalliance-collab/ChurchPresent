"""Pilot batch: songs 1-10 (page-7.png to page-17.png). Writes batch JSON and formatted lyrics."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = "nau mpro pages"  # ~/Downloads/nau mpro pages/page-N.png

def S(num, title, ref, key, meter, chords, pages, verses, chorus=None, category=None, tempo=None, notes=()):
    seq = []
    amen = bool(chorus and chorus[-1] == "A-MEN.")
    if amen:
        chorus = chorus[:-1]
    for i, v in enumerate(verses, 1):
        seq.append({"type": "verse", "number": i, "lines": v})
        if chorus:
            seq.append({"type": "chorus", "label": "Plō mprō", "lines": list(chorus)})
    if amen:  # keep A-MEN as printed, once at the end of the song
        seq[-1]["lines"].append("A-MEN.")
    return {
        "id": f"hymn-{num:04d}", "title": title, "number": str(num), "reference": ref,
        "alternate_titles": [], "language": "Bunong", "category": category,
        "lyrics": {"sequence": seq},
        "music": {"key": key, "meter": meter, "tempo": tempo, "tune_name": None,
                  "chords": [{"symbol": c, "source": "printed"} for c in chords]},
        "source": {"pdf": "nau mpro.pdf", "image_folder": SRC,
                   "sections": [{"pdf_page": p, "image": f"page-{p}.png", "region": r} for p, r in pages]},
        "files": {"score_pdf": f"hymn-{num:04d}.pdf", "page_images": [f"page-{p}.png" for p, _ in pages]},
        "review_status": "needs review", "review_notes": list(notes),
    }

songs = [
S(1, "MÂT TON NAU BRAH AMOH YÊ-SU", "TC 8, KM 1, KMM 4", "G major", "4/4",
  ["G","Am","D7","Em","Bm","A7"], [(7, "full page")],
  [["Mât ton nau Brah Amoh Yê-su, ăn lĕ rngôch bunuyh tâm rnê.",
    "Chon mon ta năp păn mbah ma Păng, yor lah Păng Brah toyh Ngăn.",
    "Chon mon ta năp păn mbah ma Păng, Yor lah Păng Brah toyh Ngăn."],
   ["Mâu dơi he chuêl ôh nau Păng rŏng, mâu dơi chuêl nau Păng yỗ.",
    "Kah gĭt ƀa-ƀơ tâm rnê lah ueh, yor lah Păng Brah toyh Ngăn.",
    "Kah gĭt ƀa-ƀơ tâm rnê lah ueh, Yor lah Păng Brah toyh Ngăn."],
   ["Lĕ rngôch mpôl bunuyh tâm neh ntu aơ, tĭng ndỗ Brah Yê-su Krist.",
    "Păng rklaih dơm dam lĕ rngôch nuyh tih, yor lah Păng Brah toyh Ngăn.",
    "Păng rklaih dơm dam lĕ rngôch nuyh tih, Yor lah Păng Brah toyh Ngăn."],
   ["Yê-su mra ƀư rai lĕ brah mhĭk, mâu ăn păng ƀư ma bunuyh.",
    "Păng tâm chuai he, klach nau r-mal, yor lah Păng Brah toyh Ngăn.",
    "Păng tâm chuai he, klach nau rmal, Yor lah Păng Brah toyh Ngăn.",
    "A-MEN."]],
  category="Yơk mbah ma Kôranh Brah",
  notes=["Verse 4 prints 'r - mal' in system 2 and 'rmal' in system 4; kept as printed (page-7)."]),

S(2, "GÂP TÂM RNÊ PĂNG", "TC 19, KM 2, KMM 9", "E♭ major", "4/4",
  ["E♭","A♭","B♭7","Gm","Adim","C7","Fm","G♭m"], [(8, "full page")],
  [["Kôranh Brah Yê-su ôp gâp pô aơ: \"mâm ƀư may ŭch jêng kloh lĕ?\"",
    "Gâp plỡ lah ma Păng, gâp ŭch lĕ! Mham khlay May rao gâp kloh ngăn."],
   ["Gâp nhhơr lĕ nuih n'hâm ma Yê-su, mâu hôm ŭch tĭng brah mhĭk ôh.",
    "Gâp iăng gŭ đăp rmên ndrel Yê-su. Yor lah Păng yỗ jêh ma gâp."],
   ["Amoh Yê-su toyh lơn ma lĕ rngôch, gâp rŏng Păng, ŭch tĭng ndỗ ngăn.",
    "Păng gŭ rêh kêng Brah Ndu Nơm klơ. Kâp mbơh sơm sâm kơl phung he."]],
  chorus=["Gâp tâm rnê păng, gâp tâm rnê Păng, mât ton ma Biăp Ueh Brah Ndu.",
          "Păng ƀư brah jêh ma săk jăn Păng, gay tâm rklaih lĕ rngôch nau tih mhĭk he.",
          "A-MEN."],
  notes=["Verse endings 'ngăn', 'gâp', 'he' before Plō mprō: verse 2 ends 'ma gâp', verse 3 ends 'phung he' (page-8 system 3).",
         "Chord in system 4 read as 'G♭m'; check (may be Gm with accidental)."]),

S(3, "TÂM RNÊ YÊ-SU", "TC 20, KM 3, KMM 8", "A major", "4/4",
  ["A","D","F♯7","Bm","F♯m","E7"], [(9, "full page")],
  [["Mât ton Brah Ndu, Nơm Kôranh ta klơ, Hađăch toyh lơn ma lĕ rngôch.",
    "Păng ăn Kon Păng khĭt yor ma bunyh, ŭch tâm rklaih lĕ phung tih."],
   ["Amoh Păng khlay lơn ma lĕ rngôch amoh, geh nau tâm rnê âk lơn.",
    "Ta năp Brah Ndu, Mbỡ he ta klơ, ntŭk phung tông mpăr yơk mbah."],
   ["Nơm Tâm Rklaih jêng mĭt jiăng bunuyh, roh yot yor ma nau tih.",
    "May jêng Nơm geh nau dơi tâm rklaih, May khĭt yor ma lĕ rngôch."],
   ["Amoh Păng jêng khlay ir ar ngăn ngên, dơi lơn ma amoh neh ntu.",
    "Dơi lơn ma amoh tâm bri brah yang, Yê-su jêng Hađăch n'ho ro."]],
  chorus=["Tâm rnê Yê-su, Tâm rnê Yê-su, Tâm rnê Amoh Brah Yê-su.",
          "Tâm rnê Yê-su, tâm rnê Yê-su, tâm rnê Amoh Brah Yê-su.",
          "A-MEN."],
  category="Yơk mbah ma Kôranh Brah",
  notes=["Verse 1 prints 'bunyh' (not 'bunuyh'); kept as printed, check (page-9 system 2).",
         "Verse endings 'tih', 'mbah', 'rngôch', 'ro' printed before Plō mprō, kept in verses.",
         "Chorus printed 'r - nê', 'A - moh' (syllables under notes); joined as 'rnê', 'Amoh'."]),

S(4, "HĂN HOM HE", "TC 22, KM 4, KMM 10", "G major", "6/8",
  ["G","D","E7","Am","B7","Em","A7/C♯","D7","C","Bm","G7","C♯dim"], [(10, "full page")],
  [["Văch hom hơi phung tâm kơl, mprơ ndrel ma nau hâk răm.",
    "Ăn lĕ ƀon lan gĭt Nơm Tâm Rklaih, ăn lĕ ƀon lan gĭt Nơm Tâm Rklaih,",
    "jêh ri he gŭ maak răm, yor Yê-su Krist rŏng he."],
   ["Mbu nâm mâu năl Yê-su, mâu dơi mprơ tâm rnê Păng.",
    "Knŏng phung chroh jêh ma Yê-su Krist, knŏng phung chroh jêh ma Yê-su Krist,",
    "dơi mprơ tâm rnê ma Păng, dơi mprơ tâm rnê ma Păng."],
   ["He mprơ bâr ngơi ăn nteh, jêh ri mbơh nau mhe mhan.",
    "Yor lah he jêng phung chroh Yê-su, yor lah he jêng phung chroh Yê-su,",
    "leo hăn tât Ƀon ka-lơ, leo hăn tât Ƀon ka-lơ."]],
  chorus=["Hăn hom he, hăn hom he, phung tâm kơl chroh Yê-su hăn ndrel,",
          "he hăn ma Ƀon Brah Ndu leo klơ, geh nau ma-ak răm ngăn ngên."],
  notes=["Verse 1 system 3: 'jêh' read from 'jêh ri he'; check.",
         "Chorus prints 'ma - ak' (split); kept as 'ma-ak'."]),

S(5, "LĔ RNGÔCH BUNUYH TA NEH NTU TÂM RNÊ", "TC 5, KM 5, 59, KMM 5", "G major", "4/4",
  ["G","Em","E7","Am","D7","C"], [(11, "full page")],
  [["Lĕ rngôch bunuyh ta neh ntu tâm rnê, mât ton Brah Ndu ma nau hâk răm.",
    "He tâm rnê Păng mprơ bâr ngơi ueh, nkoch bri lư n'găr Amoh Păng lam ntŭk."],
   ["Ay may gĭt Brah Ndu Kôranh Brah ngăn, mâu hôm geh Brah êng ban Păng ôh.",
    "Păng rhăk njêng lĕ mpô mpa kăl e, jêh ri Păng djôt he tâm ti Păng."],
   ["Yor lah Păng jêng Kôranh Brah Ndu ngăn, ăn he rŏng ma Păng lĕ nuih n'hâm.",
    "Păng yỗ ngăn jêh lĕ nau tih he, nau Păng ngơi mâu geh mâp rgâl ôh."],
   ["Văch lĕ rngôch bunuyh mât ton Brah Ndu, Păng jêng Kôranh Brah toyh ta klơ trôk.",
    "Tâm rnê ma Amoh Brah Yê-su Krist, jêh ri mât ton ma Brah Huêng Ueh."]],
  category="Yơk mbah ma Kôranh Brah"),

S(6, "MÂT TON, MÂT TON, MÂT TON", "TC 40, KM 6, KMM 11", "E♭ major", "4/4",
  ["E♭","Gm","A♭","F7","B♭7"], [(12, "full page")],
  [["Mât ton, mât ton, mât ton, Brah Ndu jêng Kôranh Brah he.",
    "Măng nâm nar hên ŭch mprơ, tâm rnê răm hâu ngăn ngên.",
    "Mât ton, mât ton, mât ton, Brah Ndu jêng Tu Brah ngăn.",
    "Mbỡ Kon, Brah Huêng Ueh, jêng nguay Kôranh Brah dơm."],
   ["Mât ton, mât ton, mât ton, Brah Ndu Mbỡ he ta klơ.",
    "Lĕ rngôch phung Tông mpăr mbah, ta năp May răm hâu ngăn.",
    "Mât ton, mât ton mât ton, Brah Ndu jêng Tu nau yỗ.",
    "Mâu blau lôch bôl ôh, May jêng mro mrăng ngăn."],
   ["Mât ton, mât ton, mât ton, Brah Ndu jêng Nơm Rklaih he.",
    "Mâu hôm geh Brah kơt May, knŏng May dơm geh nau sŏng.",
    "Mât ton, mât ton, mât ton, Brah Ndu jêng Tu nau rŏng.",
    "May ăn jêh Kon, May khĭt ta si tâm rkăng."],
   ["Mât ton, mât ton, mât ton, Brah Ndu jêng Kôranh Brah he.",
    "Lĕ bunuyh lam neh ntu, tâm rnê rhơn May hâu ngăn.",
    "Mât ton, mât ton, mât ton, Hên nhhơr nuih n'hâm ma May.",
    "Dăn May iăt hên mprơ, tâm rnê ma May. A-MEN."]],
  notes=["Verse 2 line 3 prints 'mât ton mât ton' without comma; kept.",
         "Verse 4 last line printed 'tâm r - nê'; joined as 'rnê'."]),

S(7, "SÂM NJŬN TRONG MA GÂP", "KM 7, KMM 16", "D major", "3/4",
  ["D","G","A7"], [(13, "full page")],
  [["Sâm njŭn trong ma gâp, Yê-su ơi, gâp mâu dơi gĭt trong May ôh.",
    "Gâp hươi jêh, dăn May djôt ti gâp, tât tâm Ƀon Ueh May ta klơ."],
   ["Pơk an ma gâp tu dak rsang May, gâp kroh ko ji hir dŭt n'hâm.",
    "Ăn gâp ƀă nhêt tu dak rêh May, tât ƀư bah nau ji hir gâp."],
   ["Ăp ntil khlay geh tă bah ti May, gâp mâu ŭch kuăl brah êng ôh.",
    "May Nơm njêng gâp, May tâm chuai gâp, gâp gŭ rêh yor nau yỗ May."]],
  chorus=["Siăm an huêng gâp, siăm gâp tât kŏ hơm raơm ngăn.",
          "Siăm an huêng gâp, siăm gâp tât kŏ hơm raơm ngăn.",
          "A-MEN."],
  tempo="Jazz Waltz",
  notes=["Verse endings 'klơ', 'gâp', 'May' printed at Plō mprō; kept in verses."]),

S(8, "Ơ BRAH NDU, MAY KƠL HÊN KĂL-E", "TC 44, KM 133, KMM 79", "C major", "4/4",
  ["C","F","D7","G7"], [(14, "upper section (song 8); song 9 begins below")],
  [["Ơ Brah Ndu, May kơl hên kăl e, May mra kơl hên ƀa-ƀơ.",
    "Dôl geh âk nau uh ah tâm hên, hên dăn nau Brah May kơl."],
   ["Tâm dâng n'hâm sưng May ta klơ trôk, phung chroh gŭ nde ƀa-ƀơ.",
    "King ma mpang ti May, lah hên duh, jêh ri May mprơh phung rlăng."],
   ["Kăl e May Nơm rhăk njêng ăp ntil, mpô mpa, yôk yang, neh ntu.",
    "May Brah Ndu jêng êng May Nơm lor, ăt hôm tâm ban ƀa ƀơ."],
   ["May kơp rbăn năm tâm ban du nar, tâm ban ma bar pe ndâm.",
    "Pô ri lĕ rngôch May gĭt da-dê, bơh kăl e kŏ tât lôch.",
    "A-MEN."]],
  notes=["Verse 1 'uh ah' second word printed bold/heavier; check.",
         "Verse 3 prints 'ƀa ƀơ' without hyphen; kept as printed."]),

S(9, "KÔRANH BRAH NDU ƠI", "KMM 19", "B♭ major", "4/4",
  ["B♭","E♭","F","F7","D7","G7","Cm","A♭"], [(14, "lower section"), (15, "full page")],
  [["Kôranh Brah Ndu ơi, lah gâp klân treng lĕ rngôch kan.",
    "Mpang ti May ƀư khlay ngăn kŏ gâp hih rhâl.",
    "Gâp saơ phung mănh, gâp tăng jêh nglaih dah tâm trôk.",
    "Neh ntu klơ trôk, jêng lĕ ndơ mpơl kan May."],
   ["Lah gâp klân rvê, Brah Ndu mâu nhhuach Kon Păng ôh.",
    "Mprơh Yê-su khĭt, jêng jêr ma gâp gĭt rbăng.",
    "Ta si tâm rkăng, Yê-su tuy lĕ nau tih gâp.",
    "Păng nkhŭt mham khlay gay rao kloh nau tih gâp."],
   ["Nar Krist lŏ văch, mra geh nau maak răm rhơn ngăn.",
    "Djôt leo gâp sĭt rlet ma Ƀon Ueh Păng klơ.",
    "Gâp mra păn mbah, chŭn yơk tâm dâng Kôranh Nơm Rklaih.",
    "Jêh ri gâp lah: Brah Ndu jêng Nơm Toyh ngăn."]],
  chorus=["Huêng gâp rŏng mprơ tâm rnê Brah Ndu Nơm Rklaih.",
          "May jêng Nơm toyh Nơm Brah ngăn ngên.",
          "Huêng gâp rŏng mprơ tâm rnê Brah Ndu Nơm Rklaih.",
          "May jêng Nơm Toyh, Nơm Brah ngăn ngên."],
  category="Brah Ndu",
  notes=["Verses continue from page-14 to page-15; joined in one record.",
         "Page-14 also shows printed page '-13-' under song 9 (page number artefact)."]),

S(10, "YÊ-SU JÊNG MĬT JIĂNG MA LĔ PHUNG TIH", "TC 21, KM 126, KMM 13", "G major", "3/4",
  ["G","C","D7","E7","Am","Bm","F"], [(16, "full page"), (17, "full page")],
  [["Yê-su jêng mĭt jiăng lĕ phung tih, Yê-su Nơm rŏng nuih n'hâm gâp.",
    "Bunuyh janh lơh oh nâu cha-lơi gâp, Ƀiă lah Yê-su kơl an gâp."],
   ["Lah rgănh, Yê-su ăn Brah Păng kơl, Gâp dơi gŭ tâm Păng ƀa-ƀơ.",
    "Lah bu ndơm nklỡ ăn gâp cha-lôt, Ƀiă lah Yê-su rdâk an gâp."],
   ["Yê-su rthi lah gâp geh nau rngot, Lah nuih n'hâm geh nau klân rvê.",
    "Dôl gâp nhhiăng Păng Nơm vay bonh gâp, Păng rthi gâp, jut lĕ dak măt."],
   ["Yê-su leo trong, Yê-su chiă uănh, Geh ntŭk jêr mâu lah bri gỡ.",
    "Gâp mâu klach yor, Păng gŭ dăch gâp, Păng ăn gâp rêh tâm Ƀon Păng."]],
  chorus=["Ha-lê-lu-ya, Nơm tâm rklaih gâp, Ha-lê-lu-ya, mĭt jiăng ngăn.",
          "Păng chuai gâp, jêh ri chiă uănh gâp ngăn.",
          "Păng gŭ ndrel ma gâp tât lôch.",
          "A-MEN."],
  notes=["Chorus 'Ha-lê' printed on verse-3 row at end of page-16, continues 'lu-ya' on page-17; treated as chorus for every verse.",
         "Title prints 'MA LĔ' but verse 1 sings 'jiăng lĕ' (no 'ma'); kept both as printed.",
         "'Ƀiă' printed with barred B; check spelling."]),
]

def fmt(s):
    out = [s["title"], "", s["reference"], ""]
    for b in s["lyrics"]["sequence"]:
        out.append(f'{b["number"]}.' if b["type"] == "verse" else "Chorus:")
        out += b["lines"] + [""]
    return "\n".join(out).rstrip() + "\n"

with open(os.path.join(HERE, "data/batches/batch-0001.json"), "w") as f:
    json.dump({"batch": 1, "pages": [7, 17], "songs": songs}, f, ensure_ascii=False, indent=2)
with open(os.path.join(HERE, "lyrics/batch-0001.txt"), "w") as f:
    f.write("\n\n".join(fmt(s) for s in songs))
print(len(songs), "songs")

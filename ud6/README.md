# UD6 — директен експорт за Trocen (AVKO oscillating knife)

Формат: `UD6_FORMAT_SPEC.md` (+ корекциите по-долу). Референтен декодер: `ud6_decode.py`.

| Файл | Роля |
|---|---|
| `ud6_write.py` | референтен писач `write_ud6(contours, template) -> bytes`; CLI `python3 ud6_write.py IN.dxf OUT.ud6` |
| `ud6_write.js` | същият писач в чист JS: `UD6.buildUD6(contours, opts) -> Uint8Array` (браузър/Node, шаблонът е вграден) |
| `dxf_read.py` | минимален DXF четец (LWPOLYLINE/POLYLINE/CIRCLE/ARC/LINE) |
| `ud6_tokdiff.py` | структурен diff на токените между два .ud6 |
| `make_template_red.py` | сглобява `samples/template_red.ud6` — T4 с червения слой на ножа (default шаблон) |
| `make_test_abc.py` | генерира `test_ABC.ud6` / `test_ABC_nomarks.ud6` от `tests/T4_order_ABC.dxf` |
| `make_fixtures.py` | еталони за Node тестовете (`fixtures/`) |
| `test_ud6_write.py` | `python3 -m pytest -q` |
| `test_ud6_write.node.js` | `node --test test_ud6_write.node.js` (байтова идентичност с Python) |
| `EMIN_Nesting_R0006489_v1.3.html` | Nesting Lab v1.3 с вграден писач (червен слой, kerf по ID): бутони „UD6 — текущия лист“ / „ZIP UD6 — всички листове“ |
| `test_nesting_lab.node.js` | `node --test test_nesting_lab.node.js` — целият скрипт през DOM mock, изходът през `ud6_decode.py` и `zipfile` |

## Корекции спрямо спецификацията (проверени в T1–T4)

- `0xB0 [0x12]`/`[0x13]` стоят веднъж след layer block-а, не пред всеки контур.
- `0x94 [0]` затваря всеки слой; trailer-ът започва след последния.
- `0xB5 [0x30]` е маркер за ъгъл (следван от `0xFD` фаска в T2/T3); квадратите в T4 нямат маркери.
- `0xB0 [0x23, N]`: в T1/T2 N е рангът по X, не редът на записване. Писачът ползва реда на записване.
- `0xAE`/`0xAF` са preview bitmap-и 208×208 / 136×136 (127 фон, 0/1 слой), различни във всеки файл.
  Рендват се от геометрията: мащаб N/max(W,H), X огледално, центриране по късата ос, 1 px линии.
- Header: `rec3 = (W, −(H−1))`, `rec17 = (0, Ymin+1)`, `rec18/21 = Xmax`, `rec4/24 = (W, H)`;
  `rec9 = ((1 520 000 − W)/2, 1 495 000)` — хипотеза за центриране (T1/T3/T4 точно, T2 ±7 µm).

## Слоеве (потвърдено на контролера)

Синият слой (`0xB7 [4,2]`, `0xB4 [2, 5000]`, единственият в T4) е за друг модул на машината. Ножът е на **червения**
(`0xB7 [4,1]`, `0xB4 [2, 100000]`). Слоят влече и `0xAD [R,G,B]` и `0xA1` групата в trailer-а — `make_template_red.py`.
`0xB4 [2]` / `0xA1 [2]` изглеждат като скорост (100000 µm/s ↔ 1000 ×0.1 mm/s; 5000 ↔ 50) — непотвърдено.

## Неизвестни (копие от шаблона T4)

`0xA4 [0x10, …]` (249489), `0xAD`, `0xA1…` блоковете, флагът в `rec18`, втората стойност на `rec9`.

## Опции на писача

`corner_marks`/`cornerMarks` (true), `start` (`keep`|`topleft`), `rec9` (`center`|`copy`), Python: `preview` (`render`|`copy`).

## Nesting Lab v1.3 — UD6 експорт

- Ред на рязане: дърветата на влагане в реда на разкроя; в дърво най-дълбоко вложеният първи; за пръстен CUT_ID → CUT_OD.
- Ножът реже всяка окръжност с ~kerf по-малка: OD се реже Ø(номинал + kerf OD), отворът Ø(номинал + kerf ID) — само в .ud6; DXF отворът е номинален.
- Кръг → полигон с хорда 0.5 mm (≥ 64 сегмента), старт в най-горната точка, CCW; всичко относителни сегменти.
- Начало: горен ляв ъгъл на bbox-а на пръстените (както TroCutCAD); отместването от ъгъла на листа се показва под бутоните.
- Вграденият модул трябва да е идентичен с `ud6_write.js` (тестът го проверява).

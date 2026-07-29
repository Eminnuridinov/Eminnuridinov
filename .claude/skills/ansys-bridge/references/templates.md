# Шаблони за скриптове

Всички са в комплекта **mm, N, MPa, t/mm³**. Не са пускани срещу жив Ansys — подават се като първи вариант и се настройват при първото изпълнение. Когато шаблон проработи на машината на Емин, се обновява тук с бележка за версията.

## Съдържание

1. [Инсталация на PyMAPDL](#1-инсталация-на-pymapdl)
2. [Статика — път А (PyMAPDL)](#2-статика--път-а-pymapdl)
3. [Модален анализ](#3-модален-анализ-собствени-честоти)
4. [Топлинен анализ](#4-топлинен-анализ)
5. [Термо-механичен](#5-термо-механичен-свързан)
6. [Контакт](#6-контакт)
7. [Път Б — Workbench Mechanical с етикети](#7-път-б--workbench-mechanical-с-етикети)
8. [Серия от варианти](#8-серия-от-варианти)
9. [Топологична оптимизация](#9-топологична-оптимизация)

---

## 1. Инсталация на PyMAPDL

Веднъж, в командния ред на Windows:

```bash
pip install ansys-mapdl-core
```

PyMAPDL намира сам инсталирания Ansys. Ако не го намери, пътят се подава явно:

```python
mapdl = launch_mapdl(exec_file=r"C:\Program Files\ANSYS Inc\v252\ansys\bin\winx64\ANSYS252.exe")
```

Номерът на версията (`v252`) се сверява с папката на инсталацията.

---

## 2. Статика — път А (PyMAPDL)

Пълен цикъл: геометрия → материал → мрежа → закрепване → товар → решаване → резултат.

```python
from ansys.mapdl.core import launch_mapdl

mapdl = launch_mapdl(run_location=r"C:\FEA\proba\out", override=True)
mapdl.clear()
mapdl.prep7()

# --- Материал 1: S355 (mm, N, MPa, t/mm^3) ---
mapdl.mp("EX",   1, 210000)     # модул на еластичност, MPa
mapdl.mp("PRXY", 1, 0.30)       # коефициент на Поасон
mapdl.mp("DENS", 1, 7.85e-9)    # плътност, t/mm^3

# --- Геометрия: Parasolid, изнесен от Onshape ---
mapdl.run(r"~PARAIN,'plocha_sim','x_t','C:\FEA\proba\geom',SOLIDS,0,0")
# Аргументите са: име на файла (без разширение), разширение, папка,
# какво се внася (SOLIDS), 0 = без мащабиране, 0 = без слепване.

# --- Тип елемент и мрежа ---
mapdl.et(1, "SOLID186")         # квадратичен обемен елемент, 20 възела
mapdl.esize(2.0)                # размер на елемента, mm
mapdl.mshape(1, "3D")           # тетраедри — понасят произволна форма
mapdl.mshkey(0)                 # свободна мрежа
mapdl.vmesh("ALL")

print(f"възли: {mapdl.mesh.n_node},  елементи: {mapdl.mesh.n_elem}")

# --- Закрепване: всичко в равнината Z = 0 ---
mapdl.nsel("S", "LOC", "Z", 0)
mapdl.d("ALL", "ALL", 0)        # всички степени на свобода = 0
mapdl.allsel()

# --- Товар: опън на повърхнината при X = 100 ---
# Налягане = сила / площ. Знакът: положително налягане натиска навътре,
# затова опънът се задава с минус.
sila = 5000.0                   # N
plosht = 40.0 * 5.0             # mm^2
mapdl.nsel("S", "LOC", "X", 100)
mapdl.sf("ALL", "PRES", -sila / plosht)
mapdl.allsel()

# --- Решаване ---
mapdl.slashsolu()
mapdl.antype("STATIC")
mapdl.solve()
mapdl.finish()

# --- Резултати ---
mapdl.post1()
mapdl.set(1)

seqv = mapdl.post_processing.nodal_eqv_stress()      # von Mises, MPa
umag = mapdl.post_processing.nodal_displacement("NORM")  # изместване, mm

print(f"max von Mises : {seqv.max():.1f} MPa")
print(f"max изместване: {umag.max():.4f} mm")
print(f"коеф. сигурност спрямо Rp0.2=355: {355/seqv.max():.2f}")

# Картинка
mapdl.post_processing.plot_nodal_eqv_stress(
    savefig=r"C:\FEA\proba\out\napregania.png", off_screen=True)

mapdl.exit()
```

### Как се хващат повърхнини по координати

`nsel` избира възли. Ключът е, че селекциите се трупат и трябва да се чистят с `allsel()`.

```python
mapdl.nsel("S", "LOC", "Z", 0)          # ново избиране: всичко при Z=0
mapdl.nsel("R", "LOC", "X", 0, 20)      # стеснение: от избраните — само 0 ≤ X ≤ 20
mapdl.nsel("A", "LOC", "Z", 50)         # добавяне към избраното
mapdl.allsel()                          # избери всичко обратно
```

Толеранс: `mapdl.seltol(0.01)` преди селекцията, ако координатата не е точно кръгло число.

### Други видове товар

```python
# Сила, разпределена по избраните възли
mapdl.nsel("S", "LOC", "X", 100)
n = mapdl.mesh.n_node
mapdl.f("ALL", "FY", -1000.0 / n)       # общо 1000 N надолу
mapdl.allsel()

# Собствено тегло (изисква коректна плътност)
mapdl.acel(0, 9810, 0)                  # mm/s^2 — внимание, не 9.81

# Зададено преместване вместо сила
mapdl.nsel("S", "LOC", "X", 100)
mapdl.d("ALL", "UX", 0.5)               # изтегли с 0.5 mm
mapdl.allsel()
```

---

## 3. Модален анализ (собствени честоти)

Различава се само в блока за решаване. Товар не се задава — трептенето не зависи от него.

```python
mapdl.slashsolu()
mapdl.antype("MODAL")
mapdl.modopt("LANB", 6)      # метод Block Lanczos, първите 6 форми
mapdl.mxpand(6)              # разпъни ги, за да се виждат формите
mapdl.solve()
mapdl.finish()

mapdl.post1()
rezultat = mapdl.result
for i, f in enumerate(rezultat.time_values, start=1):
    print(f"форма {i}: {f:.1f} Hz")

# Форма на трептене номер 2
mapdl.set(1, 2)
mapdl.post_processing.plot_nodal_displacement("NORM")
```

**Проверка на здравия разум:** ако честотите излязат абсурдни (десетки MHz или под 0.01 Hz), причината почти винаги е плътността — виж `conventions.md`.

Първата честота се сверява с аналитичната формула в `verify.md`.

---

## 4. Топлинен анализ

Друг тип елемент, друг материален параметър.

```python
mapdl.prep7()
mapdl.et(1, "SOLID90")            # квадратичен топлинен елемент
mapdl.mp("KXX", 1, 0.05)          # топлопроводност, W/(mm·°C) — стомана
mapdl.esize(3.0)
mapdl.vmesh("ALL")

# Зададена температура на едната страна
mapdl.nsel("S", "LOC", "Z", 0)
mapdl.d("ALL", "TEMP", 200)       # °C
mapdl.allsel()

# Конвекция към въздуха по останалите повърхнини
mapdl.nsel("S", "EXT")            # външните възли
mapdl.sf("ALL", "CONV", 2.5e-5, 20)   # W/(mm²·°C), температура на средата °C
mapdl.allsel()

mapdl.slashsolu()
mapdl.antype("STATIC")            # стационарна топлопроводност
mapdl.solve()
mapdl.finish()

mapdl.post1()
mapdl.set(1)
t = mapdl.post_processing.nodal_temperature()
print(f"температура: от {t.min():.1f} до {t.max():.1f} °C")
```

Типични коефициенти на конвекция (W/(mm²·°C)): спокоен въздух 5e-6…2.5e-5; принудителен въздух 2.5e-5…2.5e-4; вода 5e-4…1e-2.

---

## 5. Термо-механичен (свързан)

Смята се топлината, после разпределението на температурата се подава като товар в структурната задача. Логиката: нагрятото се разширява, задържаното разширяване поражда напрежение.

```python
# --- Стъпка 1: топлинна задача (както по-горе), запази резултата ---
# ... решаване ...
mapdl.finish()

# --- Стъпка 2: смени типа елемент на структурен ---
mapdl.prep7()
mapdl.etchg("TTS")                # thermal to structural
mapdl.mp("EX",   1, 210000)
mapdl.mp("PRXY", 1, 0.30)
mapdl.mp("ALPX", 1, 12e-6)        # коефициент на топлинно разширение, 1/°C
mapdl.tref(20)                    # температура без напрежение, °C
mapdl.finish()

mapdl.slashsolu()
mapdl.antype("STATIC")
mapdl.ldread("TEMP", "", "", "", "", "jobname", "rth")  # внеси температурите
# закрепването се задава тук
mapdl.solve()
```

Груба проверка: напълно задържан детайл при ΔT дава `σ = E·α·ΔT`. За стомана и ΔT = 100 °C това е около 250 MPa — стряскащо много, и точно затова температурните напрежения не се подценяват.

---

## 6. Контакт

Контактът е първата истинска нелинейност: коравината зависи от това дали двете тела се допират, а това се разбира чак по време на решаването.

```python
mapdl.prep7()
mapdl.et(2, "TARGE170")
mapdl.et(3, "CONTA174")

# Реални константи: коефициент на контактна коравина и допустимо проникване
mapdl.r(3, "", "", 1.0, 0.1)      # FKN=1.0, FTOLN=0.1

mapdl.keyopt(3, 12, 0)            # 0 = стандартен (може да се отваря)
                                  # 5 = слепен, 1 = груб, 2 = без отваряне
mapdl.mp("MU", 3, 0.15)           # коефициент на триене

# Повърхнините се избират и се покриват с контактни елементи —
# конкретните команди зависят от геометрията; при сложен случай
# е по-практично контактът да се направи в Mechanical (път Б),
# където се разпознава автоматично.

mapdl.slashsolu()
mapdl.antype("STATIC")
mapdl.nlgeom("ON")                # големи премествания
mapdl.autots("ON")                # автоматична стъпка
mapdl.nsubst(20, 100, 5)          # начални, макс, мин подстъпки
mapdl.solve()
```

**Правилата, които спестяват дни:**

- Товарът се качва на стъпки, не наведнъж — `nsubst`. Контактът трябва да се „намери" постепенно.
- Ако решението не конвергира, първата проверка е дали телата изобщо се допират в началото. Процеп от 0.01 mm води до свободно летящо тяло и мигновен провал.
- `KEYOPT(12)=5` (слепен контакт) е добър начален вариант: винаги конвергира, дава представа за разпределението. Като проработи, се сваля до реалния тип.
- Мрежата от двете страни на контакта трябва да е сходна по големина.

За сглобки път Б е по-разумен — Mechanical сам открива двойките.

---

## 7. Път Б — Workbench Mechanical с етикети

Пуска се от **Automation → Scripting** в Mechanical. Синтаксисът е на API-то на Mechanical и се проверява при първо пускане.

```python
model    = ExtAPI.DataModel.Project.Model
analysis = model.Analyses[0]

def ns(ime):
    for x in model.NamedSelections.Children:
        if x.Name == ime:
            return x
    raise Exception("Няма именувана селекция: " + ime)

# Закрепване
zakrepvane = analysis.AddFixedSupport()
zakrepvane.Location = ns("FIX")

# Сила по Z
sila = analysis.AddForce()
sila.Location  = ns("LOAD")
sila.DefineBy  = LoadDefineBy.Components
sila.ZComponent.Output.SetDiscreteValue(0, Quantity("-500 [N]"))

# Резултати
resheniе = analysis.Solution
resheniе.AddEquivalentStress()
resheniе.AddTotalDeformation()

resheniе.Solve(True)

for r in resheniе.Children:
    if hasattr(r, "Maximum") and r.Maximum is not None:
        print(r.Name, r.Maximum)
```

Предимството е, че скриптът не съдържа нито една координата — работи за всеки модел, в който повърхнините са етикетирани `FIX` и `LOAD`.

---

## 8. Серия от варианти

Тук FEA престава да бъде „проверих един детайл" и става карта на поведението. Това е и мостът към HTML инструмент: от таблицата се вади зависимост, зависимостта се зашива като формула и оттам нататък отговорът излиза мигновено.

```python
from ansys.mapdl.core import launch_mapdl
import csv

debelini = [3, 4, 5, 6, 8, 10, 12]
red = []

mapdl = launch_mapdl(override=True)

for t in debelini:
    mapdl.clear()
    mapdl.prep7()
    mapdl.mp("EX", 1, 210000); mapdl.mp("PRXY", 1, 0.3)
    mapdl.et(1, "SOLID186")

    # Параметрична геометрия направо в Ansys — без CAD
    mapdl.block(0, 100, 0, 40, 0, t)
    mapdl.esize(min(2.0, t/3))
    mapdl.vmesh("ALL")

    mapdl.nsel("S", "LOC", "X", 0); mapdl.d("ALL", "ALL", 0); mapdl.allsel()
    mapdl.nsel("S", "LOC", "X", 100)
    mapdl.f("ALL", "FZ", -1000.0/mapdl.mesh.n_node)
    mapdl.allsel()

    mapdl.slashsolu(); mapdl.antype("STATIC"); mapdl.solve(); mapdl.finish()
    mapdl.post1(); mapdl.set(1)

    red.append({
        "debelina_mm": t,
        "sigma_MPa":   round(float(mapdl.post_processing.nodal_eqv_stress().max()), 1),
        "provisvane_mm": round(float(mapdl.post_processing.nodal_displacement("NORM").max()), 4),
    })
    print(red[-1])

mapdl.exit()

with open(r"C:\FEA\proba\out\serija.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=red[0].keys())
    w.writeheader(); w.writerows(red)
```

Ако геометрията идва от Onshape с конфигурации, вариантите се изнасят като отделни `.x_t` файла и в цикъла се сменя само името на файла.

---

## 9. Топологична оптимизация

Задава се обем, товари и закрепвания; резултатът е формата, която носи товара с най-малко материал. Работи се в Workbench (Structural Optimization), не в класическия MAPDL.

Редът е: статичен анализ → добавя се **Structural Optimization** → цел `Minimize Compliance` (максимална коравина) → ограничение `Response Constraint: Mass ≤ 30%` → зоните около закрепванията и товарите се маркират като **Exclusion Region**, за да не бъдат изядени.

Резултатът е груба форма, не готов детайл. Тя се пречертава в Onshape като нормална параметрична геометрия и се смята наново, за да се провери. Директното изнасяне на STL от оптимизацията и печатането му е лоша практика — формата е числено предложение, не инженерно решение.

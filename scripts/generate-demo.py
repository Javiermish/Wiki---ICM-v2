"""Genera exclusivamente material original de Wiki ICM. Regeneración opcional: Python + Pillow.
Los binarios se versionan: ni desarrollo ni build requieren Python/Pillow.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "public" / "demo"
ROOT.mkdir(parents=True, exist_ok=True)


def pdf_literal(text):
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


pages = [
    ["Certamen 2 - 2024-2", "Calculo I / Semestre curricular 1", "DEMOSTRACION ORIGINAL - No es una evaluacion oficial.",
     "1. Limites y continuidad", "Sea f(x) = x + 2. Calcula el limite cuando x tiende a 3.",
     "Explica por que esta funcion tiene continuidad en x = 3.", "Texto seleccionable y buscable. Busca: continuidad.",
     "Contenido original creado para probar Wiki ICM. Distribucion autorizada."],
    ["Certamen 2 - 2024-2 / Desarrollo", "DEMOSTRACION ORIGINAL - Pagina 2", "2. Una solucion breve",
     "El limite es 5: sustituimos x = 3 en la expresion x + 2.",
     "La continuidad permite relacionar el valor y el limite.", "Actividad: escribe una explicacion con tus propias palabras.",
     "Esta pagina sirve para comprobar navegacion y seleccion de texto."],
    ["Certamen 2 - 2024-2 / Repaso", "DEMOSTRACION ORIGINAL - Pagina 3", "3. Para seguir practicando",
     "Prueba ahora con g(x) = 2x - 1 y x = 4.", "Compara continuidad, valor de la funcion y limite.",
     "Resultado de comprobacion: 7.", "Fin del documento de demostracion. No contiene datos personales.",
     "Wiki ICM autoriza copiar y distribuir este ejemplo original (CC0)."],
]
objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
kids = []
for index, lines in enumerate(pages):
    page_id = len(objects) + 1
    content_id = page_id + 1
    kids.append(f"{page_id} 0 R")
    objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>".encode())
    commands = ["BT", "/F1 20 Tf", "48 780 Td"]
    for line_index, line in enumerate(lines):
        if line_index:
            commands.extend(["0 -42 Td", "/F1 11 Tf"])
        commands.append(f"({pdf_literal(line)}) Tj")
    commands.extend(["ET", f"BT /F1 10 Tf 48 40 Td (Wiki ICM - Demo - {index + 1} / 3) Tj ET"])
    stream = "\n".join(commands).encode("latin1")
    objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(pages)} >>".encode()
output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
offsets = [0]
for number, obj in enumerate(objects, 1):
    offsets.append(len(output))
    output.extend(f"{number} 0 obj\n".encode() + obj + b"\nendobj\n")
xref = len(output)
output.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
for offset in offsets[1:]:
    output.extend(f"{offset:010d} 00000 n \n".encode())
output.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
(ROOT / "calculo-certamen-demo.pdf").write_bytes(output)

image = Image.new("RGB", (1100, 800), "#f5f5ee")
draw = ImageDraw.Draw(image)
font = ImageFont.load_default(size=27)
small = ImageFont.load_default(size=22)
draw.rounded_rectangle((45, 45, 1055, 755), radius=20, fill="white", outline="#174b38", width=3)
draw.text((80, 80), "Wiki ICM / DEMOSTRACIÓN ORIGINAL", fill="#174b38", font=font)
draw.text((80, 135), "Cálculo I - Funciones y derivadas", fill="#182521", font=font)
draw.text((80, 190), "Ejemplo inventado. No es material oficial de la UdeC.", fill="#52645b", font=small)
draw.line((130, 590, 940, 590), fill="#52645b", width=3)
draw.line((160, 650, 160, 280), fill="#52645b", width=3)
points = [(x, round(590 - ((x - 160) / 60) ** 2 * 2)) for x in range(160, 890)]
draw.line(points, fill="#348568", width=6)
draw.text((700, 320), "f(x) = x²", fill="#174b38", font=font)
draw.text((195, 620), "Esquema ilustrativo, no a escala.", fill="#52645b", font=small)
draw.text((80, 700), "Creación original para Wiki ICM. Distribución autorizada (CC0).", fill="#52645b", font=small)
for filename, fmt in [("calculo-listado-demo.png", "PNG"), ("calculo-apuntes-demo.webp", "WEBP"), ("calculo-funciones-demo.jpg", "JPEG")]:
    image.save(ROOT / filename, fmt)
print("Creados: PDF de 3 páginas y ejemplos PNG, JPEG y WebP en public/demo/.")

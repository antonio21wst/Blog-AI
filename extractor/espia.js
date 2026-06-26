require("dotenv").config();
const puppeteer = require("puppeteer");

async function espiarWeb() {
  console.log("🕵️ Iniciando Modo Espía...");
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  // Configuramos una pantalla grande
  await page.setViewport({ width: 1280, height: 1080 });

  console.log("Navegando a Habitaciones y esperando 8 segundos...");
  await page.goto("https://www.lajoyahoteles.com/habitaciones", {
    waitUntil: "networkidle2",
  });

  // Pausa forzada para vencer cualquier pantalla de carga (preloader)
  await new Promise((r) => setTimeout(r, 8000));

  // 1. TOMAR FOTOGRAFÍA
  await page.screenshot({ path: "debug-lajoya.jpg", fullPage: true });
  console.log(
    "📸 ¡Foto tomada! Revisa el archivo debug-lajoya.jpg en tu carpeta.",
  );

  // 2. EXTRAER TÍTULOS DIRECTAMENTE DEL NAVEGADOR
  const datos = await page.evaluate(() => {
    // Buscamos cualquier cosa que parezca un título
    const titulos = Array.from(
      document.querySelectorAll(
        "h1, h2, h3, h4, h5, h6, .elementor-heading-title",
      ),
    )
      .map((el) => el.innerText.trim())
      .filter((text) => text.length > 3);

    return {
      titulosEncontrados: titulos,
      textoCrudo: document.body.innerText.substring(0, 300), // Primeros 300 caracteres que ve el bot
    };
  });

  console.log("\n--- REPORTE DEL ESPÍA ---");
  console.log("Títulos detectados:", datos.titulosEncontrados);
  console.log("\nTexto inicial de la web:\n", datos.textoCrudo);

  await browser.close();
  console.log("\n🏁 Misión terminada.");
}

espiarWeb();

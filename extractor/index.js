require("dotenv").config();
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const axios = require("axios");

const BASE_URL = "https://www.lajoyahoteles.com";

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      let distance = 400;
      let timer = setInterval(() => {
        let scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

async function extraerContenidoEstructurado() {
  console.log(
    "🤖 Iniciando Bot V5: Extracción de Galerías y Clasificación Perfecta...",
  );
  const browser = await puppeteer.launch({ headless: "new" });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1080 });

    console.log(`\n🔍 Explorando la página principal: ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await autoScroll(page);
    await new Promise((r) => setTimeout(r, 2000));

    const html = await page.content();
    const $ = cheerio.load(html);

    let items = [];

    // --- 1. EXTRAER HABITACIONES Y EVENTOS ---
    $(".data-room-container").each((i, el) => {
      let title = $(el).find(".description-tittle").text().trim();
      let style = $(el).attr("style") || "";
      let match = style.match(/url\(['"]?(.*?)['"]?\)/);
      let imageSrc = match ? match[1] : null;

      let modalLabel = $(el).find("label[for^='btn-modal-']").attr("for");
      let description = "";
      if (modalLabel) {
        let modalNumber = modalLabel.replace("btn-modal-", "");
        description = $(`.container-modal-${modalNumber} .content-modal`)
          .find("p, li")
          .map((i, p) => $(p).text().trim())
          .get()
          .join(". ")
          .substring(0, 400);
      } else {
        description = $(el).find(".description-text").text().trim() || title;
      }

      if (title && imageSrc) {
        // Si es un salón se va a Eventos, si no, a Habitaciones
        let category = title
          .toLowerCase()
          .match(/salón|evento|reunión|business/)
          ? "Eventos"
          : "Habitaciones";
        items.push({ title, description, imageSrc, category });
      }
    });

    // --- 2. EXTRAER PLATILLOS Y PUEBLOS (Se van directo a TURISMO) ---
    $(".hidalgo-slide-wrapper").each((i, el) => {
      let title = $(el).find(".hidalgo-feature-subtitle").text().trim();
      let imageSrc = $(el).find(".hidalgo-carousel-img").attr("src");
      let description = $(el).find(".hidalgo-feature-p").last().text().trim();
      if (title && imageSrc) {
        items.push({ title, description, imageSrc, category: "Turismo" });
      }
    });

    // --- 3. EXTRAER LUGARES TURÍSTICOS (Se van directo a TURISMO) ---
    $(".tourism-card").each((i, el) => {
      let title = $(el).find(".tourism-card-title").text().trim();
      let imageSrc = $(el).find(".tourism-card-img").attr("src");
      let description = $(el)
        .find(".tourism-card-text p")
        .map((i, p) => $(p).text().trim())
        .get()
        .join(" ");
      if (title && imageSrc) {
        items.push({ title, description, imageSrc, category: "Turismo" });
      }
    });

    // --- 4. EXTRAER LA GALERÍA "SOMOS DESTINO" (Se van directo a DESTINO) ---
    $("#gallery a img").each((i, el) => {
      let imageSrc = $(el).attr("data-image") || $(el).attr("src");
      if (imageSrc) {
        items.push({
          title: `Instalaciones La Joya ${i + 1}`,
          description:
            "Descubre la elegancia y confort de los espacios que Hotel La Joya tiene preparados para hacer de tu visita una experiencia inigualable.",
          imageSrc,
          category: "Destino",
        });
      }
    });

    // --- GUARDAR EN STRAPI ---
    let itemsExtraidos = 0;
    for (const item of items) {
      // Ignorar basura
      if (
        item.title.toLowerCase().includes("opinions") ||
        item.title.toLowerCase().includes("we are destination")
      )
        continue;

      let imageUrl = null;
      try {
        imageUrl = new URL(item.imageSrc, BASE_URL).href;
      } catch (e) {
        continue;
      }

      const nuevoContenido = {
        title: item.title,
        description: item.description.replace(/\s+/g, " ").trim(),
        category: item.category,
        imageUrl: imageUrl,
      };

      console.log(`✅ ¡Extraído! [${item.category}] ${item.title}`);

      try {
        await axios.post(
          `${process.env.STRAPI_URL}/api/contents`,
          { data: nuevoContenido },
          {
            headers: { Authorization: `Bearer ${process.env.STRAPI_TOKEN}` },
          },
        );
        itemsExtraidos++;
      } catch (apiError) {
        console.error(`❌ Error Strapi en "${item.title}"`);
      }
    }

    console.log(`\n📥 Total de elementos guardados: ${itemsExtraidos}`);
  } catch (error) {
    console.error("❌ Error general en el bot:", error.message);
  } finally {
    await browser.close();
    console.log("🏁 Proceso finalizado.");
  }
}

extraerContenidoEstructurado();

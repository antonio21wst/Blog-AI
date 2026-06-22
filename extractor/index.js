require("dotenv").config();
const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const axios = require("axios");
const cron = require("node-cron");
const FormData = require("form-data"); // NUEVA IMPORTACIÓN

function analyzeStack(html, $) {
  const techs = [];
  const htmlString = html.toLowerCase();

  if (htmlString.includes("_next/static") || htmlString.includes('id="__next"'))
    techs.push("Next.js");
  if (htmlString.includes("react") || htmlString.includes("data-reactroot"))
    techs.push("React");
  if (htmlString.includes("firebase")) techs.push("Firebase");
  if (htmlString.includes("tailwind")) techs.push("Tailwind CSS");
  if (htmlString.includes("jquery")) techs.push("jQuery");
  if (htmlString.includes("wp-content/themes")) techs.push("WordPress");
  if (htmlString.includes("bootstrap")) techs.push("Bootstrap");

  const generator = $('meta[name="generator"]').attr("content");
  if (generator) techs.push(generator.split(" ")[0]);

  return [...new Set(techs)];
}

async function getProjectsFromStrapi() {
  try {
    const response = await axios.get(
      `${process.env.STRAPI_URL}/api/proyectos`,
      {
        headers: { Authorization: `Bearer ${process.env.STRAPI_TOKEN}` },
      },
    );
    return response.data.data;
  } catch (error) {
    console.error("Error obteniendo proyectos:", error.message);
    return [];
  }
}

// NUEVA FUNCIÓN: Envía el archivo binario a la galería de medios de Strapi
async function uploadImageToStrapi(imageBuffer, filename) {
  try {
    const form = new FormData();
    // Le pasamos el buffer de memoria y le inventamos un nombre de archivo
    form.append("files", imageBuffer, { filename: filename });

    const response = await axios.post(
      `${process.env.STRAPI_URL}/api/upload`,
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.STRAPI_TOKEN}`,
          ...form.getHeaders(), // Strapi necesita saber que es un form-data
        },
      },
    );

    // Strapi devuelve un arreglo con los datos del archivo subido. Retornamos el ID.
    return response.data[0].id;
  } catch (error) {
    console.error(`Error subiendo la imagen a Strapi: ${error.message}`);
    return null;
  }
}

async function scrapeProjectData(proyecto) {
  const targetUrl = proyecto.url;
  const documentId = proyecto.documentId;

  console.log(
    `\n🔍 Extrayendo datos y capturando imagen para: ${targetUrl}...`,
  );

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  // NUEVO: Configuramos el tamaño de la ventana para que la foto se vea como en una laptop de 13 pulgadas
  await page.setViewport({ width: 1280, height: 800 });

  try {
    await page.goto(targetUrl, { waitUntil: "networkidle2" });

    // --- NUEVO: LÓGICA DE LA CÁMARA ---
    console.log("📸 Tomando captura de pantalla...");
    // Tomamos la foto en formato JPEG para que no pese tanto en la base de datos
    const screenshotBuffer = await page.screenshot({
      type: "jpeg",
      quality: 80,
    });

    console.log("☁️ Subiendo captura a la galería de Strapi...");
    const imageId = await uploadImageToStrapi(
      screenshotBuffer,
      `screenshot-${documentId}.jpg`,
    );
    // ----------------------------------

    const html = await page.content();
    const $ = cheerio.load(html);

    const newTitle =
      $("head > title").first().text() ||
      $('meta[property="og:title"]').attr("content") ||
      "Sin título";
    const newDescription =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "Sin descripción";
    const newTechnologies = analyzeStack(html, $);

    let hasChanged = false;
    let changeSummary = [];

    if (proyecto.title !== newTitle.trim()) {
      hasChanged = true;
      changeSummary.push("Título modificado");
    }

    const oldTechs = JSON.stringify(proyecto.technologies || []);
    const currentTechs = JSON.stringify(newTechnologies);

    if (oldTechs !== currentTechs) {
      hasChanged = true;
      changeSummary.push("Stack tecnológico actualizado");
    }

    if (hasChanged) {
      console.log(
        `⚠️ Cambios detectados: ${changeSummary.join(", ")}. Registrando historial...`,
      );
      await axios.post(
        `${process.env.STRAPI_URL}/api/actualizacions`,
        {
          data: {
            summary: `Cambios automáticos: ${changeSummary.join(", ")}`,
            date: new Date().toISOString(),
            project: documentId,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.STRAPI_TOKEN}`,
            "Content-Type": "application/json",
          },
        },
      );
    }

    console.log("Actualizando la ficha del proyecto...");

    // Preparamos los datos base a actualizar
    const updatePayload = {
      title: newTitle.trim(),
      description: newDescription.trim(),
      technologies: newTechnologies,
      lastChecked: new Date().toISOString(),
    };

    // NUEVO: Si la imagen se subió con éxito, vinculamos el ID al campo 'screenshots'
    if (imageId) {
      // Nota: Se envía dentro de un arreglo porque los campos de medios múltiples lo requieren así
      updatePayload.screenshot = imageId;
    }

    await axios.put(
      `${process.env.STRAPI_URL}/api/proyectos/${documentId}`,
      {
        data: updatePayload,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.STRAPI_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log(
      `✅ Proyecto Document ID ${documentId} actualizado correctamente (Imagen vinculada: ${!!imageId}).`,
    );
  } catch (error) {
    console.error(`Error procesando la URL ${targetUrl}: ${error.message}`);
  } finally {
    await browser.close();
  }
}

console.log("🤖 Bot extractor con cámara iniciado. El cron está activo...");

cron.schedule("* * * * *", async () => {
  console.log("\n⏰ [CRON] Iniciando ciclo de monitoreo...");

  const proyectos = await getProjectsFromStrapi();

  if (proyectos.length === 0) {
    console.log("No hay proyectos para monitorear.");
    return;
  }

  console.log(
    `Se encontraron ${proyectos.length} proyectos. Iniciando análisis secuencial...`,
  );

  for (const proyecto of proyectos) {
    if (proyecto.url) {
      await scrapeProjectData(proyecto);
    }
  }

  console.log("\n🏁 [CRON] Ciclo finalizado. Esperando al siguiente minuto...");
});

require("dotenv").config();
const axios = require("axios");

// 1. Pega aquí todos los enlaces que tengas de la agencia
const enlacesAgencia = [
  /*"https://polloparatodos.com",
  "https://www.visualizamasideas.com/", // Reemplaza o agrega todos los que necesites
  "https://www.pecuarius.com/",*/
  "https://www.lajoyahoteles.com/",
  "https://hotelpachuca.com/reservacion_bk.php",
  "https://lajoyahoteles.com/reservacion.php",
];

async function inyectarNuevosProyectos() {
  console.log("🚀 Iniciando escaneo de enlaces contra la base de datos...\n");

  try {
    // 2. Obtenemos los proyectos que YA existen en Strapi
    const response = await axios.get(
      `${process.env.STRAPI_URL}/api/proyectos`,
      {
        headers: { Authorization: `Bearer ${process.env.STRAPI_TOKEN}` },
      },
    );

    const proyectosExistentes = response.data.data;

    // Creamos un arreglo solo con las URLs para comparar fácilmente
    const urlsExistentes = proyectosExistentes.map((p) => p.url);

    let agregados = 0;

    // 3. Revisamos enlace por enlace
    for (const link of enlacesAgencia) {
      if (urlsExistentes.includes(link)) {
        console.log(`⏩ Omitido: ${link} (Ya existe en la base de datos)`);
      } else {
        console.log(`➕ Nuevo detectado: ${link}. Registrando en Strapi...`);

        // 4. Si es nuevo, lo creamos con datos genéricos.
        // El bot extractor se encargará de rellenar el resto luego.
        await axios.post(
          `${process.env.STRAPI_URL}/api/proyectos`,
          {
            data: {
              title: "Pendiente de análisis...",
              url: link,
              description: "Esperando al bot extractor...",
              projectStatus: "active",
              technologies: [],
            },
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.STRAPI_TOKEN}`,
              "Content-Type": "application/json",
            },
          },
        );

        agregados++;
      }
    }

    console.log(
      `\n✅ Proceso terminado. Se inyectaron ${agregados} proyectos nuevos.`,
    );
    console.log(
      "🤖 El bot principal (index.js) los analizará en su próximo ciclo.",
    );
  } catch (error) {
    console.error("❌ Error conectando con Strapi:", error.message);
  }
}

inyectarNuevosProyectos();

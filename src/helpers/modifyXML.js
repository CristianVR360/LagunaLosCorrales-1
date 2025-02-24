const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const xmlFilePath = path.join(__dirname, '../../public/pano.xml');

const getData = async () => {
  try {
    const data = await fs.promises.readFile(xmlFilePath, 'utf-8');
    const result = await xml2js.parseStringPromise(data);
    
    return result;
  } catch (error) {
    console.error(error);
    return error.message;
  }
};

const updateHotspotAttributes = async (hotspotId, description, status, newInfo) => {
  try {
    const result = await getData();

    // Buscar en ambos panoramas (node20 y node21)
    const panoramas = result.tour.panorama.filter(p => p.$.id === 'node20' || p.$.id === 'node21');

    let hotspotUpdated = false; // Bandera para verificar si se actualizó el hotspot

    for (const panorama of panoramas) {
      if (panorama.hotspots && panorama.hotspots.length > 0) {
        const hotspots = panorama.hotspots[0].hotspot;
        const hotspot = hotspots.find(h => h.$.id.toLowerCase() === hotspotId.toLowerCase());

        if (hotspot) {
          // Actualizar los atributos del hotspot
          hotspot.$.description = description;
          hotspot.$.skinid = status;
          hotspot.$.url = newInfo;

          hotspotUpdated = true; // Marcar como actualizado
          break; // Salir del bucle una vez que se encuentra y actualiza el hotspot
        }
      }
    }

    if (hotspotUpdated) {
      // Convertir el objeto XML a cadena
      const builder = new xml2js.Builder();
      const xml = builder.buildObject(result);

      // Escribir el archivo XML actualizado
      await fs.promises.writeFile(xmlFilePath, xml);
      console.log('File updated correctly');
    } else {
      throw new Error(`No hotspot found with the id: ${hotspotId}`);
    }
  } catch (error) {
    console.error(error);
    return error.message;
  }
};

const getAllHotspots = async () => {
  try {
    const result = await getData();
    
    // Buscar los panoramas con los ids "node20" y "node21"
    const panoramas = result.tour.panorama.filter(p => p.$.id === 'node20' || p.$.id === 'node21');
    
    let hotspotArray = [];

    panoramas.forEach(panorama => {
      if (panorama.hotspots && panorama.hotspots.length > 0) {
        const hotspots = panorama.hotspots[0].hotspot;
        const excludedIds = ['point01', 'point02', 'point03', 'point04', 'point05', 'point25'];
        
        const filteredHotspots = hotspots
          .filter(hotspot => !excludedIds.includes(hotspot.$.id.toLowerCase()))
          .map(hotspot => {
            return {
              id: hotspot.$.id || '',
              tilt: hotspot.$.tilt || '',
              url: hotspot.$.url || '',
              skinid: hotspot.$.skinid || '',
              title: hotspot.$.title || '',
              pan: hotspot.$.pan || '',
              description: hotspot.$.description || '',
              nodeId: panorama.$.id // Agregar el id del nodo para identificar de qué nodo proviene
            };
          });

        hotspotArray = hotspotArray.concat(filteredHotspots);
      } else {
        console.warn(`Panorama with id "${panorama.$.id}" has no hotspots`);
      }
    });

 // Ordenar los hotspots
// Ordenar los hotspots
hotspotArray.sort((a, b) => {
  const regexAlphaNum = /^([A-Z]+)(\d+)-(\d+)$/; // Formato E04-1
  const regexSimpleNum = /^(\d+)$/; // Formato numérico simple (1, 2, 3, etc.)

  const matchA = a.id.match(regexAlphaNum) || a.id.match(regexSimpleNum);
  const matchB = b.id.match(regexAlphaNum) || b.id.match(regexSimpleNum);

  if (matchA && matchB) {
    // Si ambos IDs tienen el formato E04-1
    if (matchA.length === 4 && matchB.length === 4) {
      const [, etapaA, numA1, numA2] = matchA;
      const [, etapaB, numB1, numB2] = matchB;

      // Comparar las partes alfanuméricas (etapas)
      if (etapaA === etapaB) {
        // Si las etapas son iguales, comparar los números principales (numA1 y numB1)
        if (parseInt(numA1) === parseInt(numB1)) {
          // Si los números principales son iguales, comparar los números secundarios (numA2 y numB2)
          return parseInt(numA2) - parseInt(numB2);
        } else {
          return parseInt(numA1) - parseInt(numB1);
        }
      } else {
        // Si las etapas son diferentes, ordenar alfabéticamente por etapa
        return etapaA.localeCompare(etapaB);
      }
    }
    // Si ambos IDs son numéricos simples
    else if (matchA.length === 2 && matchB.length === 2) {
      const numA = parseInt(matchA[1]);
      const numB = parseInt(matchB[1]);
      return numA - numB; // Ordenar como números
    }
    // Si un ID es E04-1 y el otro es numérico simple
    else {
      // Los IDs numéricos simples van primero
      return matchA.length === 2 ? -1 : 1;
    }
  } else {
    // Si no coincide con ningún formato esperado, ordenar alfabéticamente por ID
    return a.id.localeCompare(b.id);
  }
});



    return hotspotArray;
  } catch (error) {
    console.error(error);
    return error.message;
  }
};

const exportDataToJSON = async (filePath) => {
  try {
    const result = await getData();
    const panoramas = result.tour.panorama.filter(p => p.$.id === 'node20' || p.$.id === 'node21');

    let hotspotArray = [];

    panoramas.forEach(panorama => {
      if (panorama.hotspots && panorama.hotspots.length > 0) {
        const hotspots = panorama.hotspots[0].hotspot;
        const excludedIds = ['point01', 'point02', 'point03', 'point04', 'point05', 'point25'];

        const filteredHotspots = hotspots
          .filter(hotspot => !excludedIds.includes(hotspot.$.id.toLowerCase()))
          .map(hotspot => ({
            id: hotspot.$.id || '',
            tilt: hotspot.$.tilt || '',
            url: hotspot.$.url || '',
            skinid: hotspot.$.skinid || '',
            title: hotspot.$.title || '',
            pan: hotspot.$.pan || '',
            description: hotspot.$.description || '',
            nodeId: panorama.$.id // Agregar el id del nodo para identificar de qué nodo proviene
          }));

        hotspotArray = hotspotArray.concat(filteredHotspots);
      } else {
        console.warn(`Panorama with id "${panorama.$.id}" has no hotspots`);
      }
    });

    const jsonData = JSON.stringify(hotspotArray, null, 2);
    await fs.promises.writeFile(filePath, jsonData);
    console.log('Datos exportados correctamente');
  } catch (error) {
    console.error(error);
  }
};

const importDataFromJSON = async (filePath) => {
  try {
    const jsonData = await fs.promises.readFile(filePath, 'utf-8');
    const hotspots = JSON.parse(jsonData);

    const result = await getData();
    const panoramas = result.tour.panorama.filter(p => p.$.id === 'node20' || p.$.id === 'node21');

    if (panoramas.length > 0) {
      for (const hotspot of hotspots) {
        await updateHotspotAttributes(hotspot.id, hotspot.description, hotspot.skinid, hotspot.url);
      }
      console.log('Datos importados correctamente');
    } else {
      console.warn('Panorama with id "node20" or "node21" has no hotspots');
    }
  } catch (error) {
    console.error(error);
  }
};

module.exports = {
  updateHotspotAttributes,
  getAllHotspots, 
  exportDataToJSON,
  importDataFromJSON
};
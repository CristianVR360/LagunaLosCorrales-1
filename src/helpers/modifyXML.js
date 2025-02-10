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

    // Buscar el panorama con el id "node20" o "node21"
    const panorama = result.tour.panorama.find(p => p.$.id === 'node20' || p.$.id === 'node21');

    if (panorama) {
      if (panorama.hotspots && panorama.hotspots.length > 0) {
        const hotspots = panorama.hotspots[0].hotspot;
        const hotspot = hotspots.find(h => h.$.id.toLowerCase() === hotspotId.toLowerCase());

        if (hotspot) {
          hotspot.$.description = description;
          hotspot.$.skinid = status;
          hotspot.$.url = newInfo;

          const builder = new xml2js.Builder();
          const xml = builder.buildObject(result);

          await fs.promises.writeFile(xmlFilePath, xml);
          console.log('File updated correctly');
        } else {
          throw new Error(`No hotspot found with the id: ${hotspotId}`);
        }
      } else {
        console.warn(`Panorama with id "${panorama.$.id}" has no hotspots`);
        throw new Error(`Panorama with id "${panorama.$.id}" has no hotspots`);
      }
    } else {
      console.warn('Panorama with id "node20" or "node21" not found');
      throw new Error('Panorama with id "node20" or "node21" not found');
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
    hotspotArray.sort((a, b) => {
      const regexAlphaNum = /^([A-Z]*)-?(\d+)$/;
      const matchA = a.id.match(regexAlphaNum);
      const matchB = b.id.match(regexAlphaNum);
      
      if (matchA && matchB) {
        const [, etapaA, numA] = matchA;
        const [, etapaB, numB] = matchB;
        
        if (etapaA === etapaB) {
          return parseInt(numA) - parseInt(numB);
        } else {
          return etapaA.localeCompare(etapaB);
        }
      } else {
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
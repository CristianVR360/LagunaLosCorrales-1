const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const { supabase } = require('../database/supabase');

const templateXmlPath = path.join(__dirname, '../data/pano_template.xml');
const publicXmlPath = path.join(__dirname, '../../public/masterplan/pano.xml');

// Helper to read and parse base XML template
const getData = async () => {
  try {
    const targetPath = fs.existsSync(templateXmlPath) ? templateXmlPath : publicXmlPath;
    const data = await fs.promises.readFile(targetPath, 'utf-8');
    const result = await xml2js.parseStringPromise(data);
    return result;
  } catch (error) {
    console.error('Error reading XML file:', error);
    throw error;
  }
};

// Find the main panorama containing the lot hotspots
const getMainPanorama = (result) => {
  if (!result || !result.tour || !result.tour.panorama) return null;

  const startNodeId = result.tour.$ && result.tour.$.start;
  const lotSkinIds = ['ht_disponible', 'ht_reservado', 'ht_nodisponible', 'ht_promocion'];
  
  if (startNodeId) {
    const startPanorama = result.tour.panorama.find(p => p.$.id === startNodeId);
    if (startPanorama && startPanorama.hotspots && startPanorama.hotspots[0].hotspot) {
      const hasLotHotspot = startPanorama.hotspots[0].hotspot.some(h => 
        h.$.skinid && lotSkinIds.includes(h.$.skinid.toLowerCase())
      );
      if (hasLotHotspot) {
        return startPanorama;
      }
    }
  }

  for (const p of result.tour.panorama) {
    if (p.hotspots && p.hotspots[0].hotspot) {
      const hasLotHotspot = p.hotspots[0].hotspot.some(h => 
        h.$.skinid && lotSkinIds.includes(h.$.skinid.toLowerCase())
      );
      if (hasLotHotspot) {
        return p;
      }
    }
  }

  let bestPanorama = null;
  let maxHotspots = -1;
  for (const p of result.tour.panorama) {
    const count = p.hotspots && p.hotspots[0].hotspot ? p.hotspots[0].hotspot.length : 0;
    if (count > maxHotspots) {
      maxHotspots = count;
      bestPanorama = p;
    }
  }

  return bestPanorama;
};

let cachedUF = null;
let lastFetch = 0;

const fetchUFValue = async () => {
  const now = Date.now();
  if (cachedUF && (now - lastFetch < 3600000)) {
    return cachedUF;
  }
  try {
    const res = await fetch('https://mindicador.cl/api/uf');
    const data = await res.json();
    if (data && data.serie && data.serie[0] && data.serie[0].valor) {
      cachedUF = data.serie[0].valor;
      lastFetch = now;
      console.log('Fetched UF rate in modifyXML:', cachedUF);
      return cachedUF;
    }
  } catch (err) {
    console.warn('Could not fetch UF rate in modifyXML, using fallback:', err.message);
  }
  return 38000;
};

// Formats JSON description back to clean display text for Pano2VR 360 viewer
const cleanDescriptionForXML = (desc) => {
  if (!desc) return '';
  try {
    const trimmed = String(desc).trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const data = JSON.parse(trimmed);
      const lines = [];
      if (data.area) {
        let areaStr = String(data.area).trim();
        if (!areaStr.toLowerCase().startsWith('superficie')) {
          if (!areaStr.toLowerCase().includes('ha') && !areaStr.toLowerCase().includes('m')) {
            const num = parseFloat(areaStr.replace(/\./g, '').replace(',', '.'));
            areaStr = !isNaN(num) ? `Superficie: ${new Intl.NumberFormat('es-CL').format(num)} m²` : `Superficie: ${areaStr}`;
          } else {
            areaStr = `Superficie: ${areaStr}`;
          }
        }
        lines.push(areaStr);
      }
      if (data.comment && data.comment.trim()) {
        lines.push(data.comment.trim());
      }
      if (data.description && data.description.trim()) {
        lines.push(data.description.trim());
      }
      return lines.join('\n');
    }
  } catch (e) {}
  return desc;
};

// Formats lot price cleanly according to status and currency
const formatPriceForHotspot = (rawUrl, skinid, currency, rate) => {
  if (skinid === 'ht_noDisponible') {
    return 'Vendido';
  }
  if (skinid === 'ht_reservado') {
    return 'Reservado';
  }

  const rawStr = String(rawUrl || '').trim();
  if (!rawStr || rawStr === '0' || rawStr.toLowerCase() === 'vendido') {
    return skinid === 'ht_noDisponible' ? 'Vendido' : 'Consultar';
  }

  const digitsOnly = parseFloat(rawStr.replace(/\D/g, '')) || 0;
  if (digitsOnly === 0) {
    return rawStr;
  }

  let ufValue = 0;
  let clpValue = 0;
  if (digitsOnly > 50000) {
    clpValue = digitsOnly;
    ufValue = rate > 0 ? Math.round(clpValue / rate) : 0;
  } else {
    ufValue = digitsOnly;
    clpValue = rate > 0 ? Math.round(ufValue * rate) : 0;
  }

  if (currency === 'UF') {
    return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(ufValue) + ' UF';
  } else {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(clpValue);
  }
};

// Sync database state into local XML files (safe fallback)
const syncDatabaseToXML = async (dbLots) => {
  try {
    const result = await getData();
    const panorama = getMainPanorama(result);

    if (panorama) {
      const nodeId = panorama.$.id;
      if (panorama.hotspots && panorama.hotspots.length > 0) {
        const hotspots = panorama.hotspots[0].hotspot;

        let currency = 'UF';
        const configData = dbLots.find(l => l.id === 'CONFIG_CURRENCY');
        if (configData) {
          currency = configData.url || 'UF';
        }
        
        const rate = await fetchUFValue();

        dbLots.forEach((dbLot) => {
          if (dbLot.id && dbLot.id.toLowerCase() === 'config_currency') return;
          const hotspot = hotspots.find(h => h.$.id.toLowerCase() === dbLot.id.toLowerCase());
          if (hotspot) {
            let skinid = dbLot.skinid || '';
            if (skinid.toLowerCase() === 'ht_nodisponible') {
              skinid = 'ht_noDisponible';
            }
            hotspot.$.skinid = skinid;
            hotspot.$.description = cleanDescriptionForXML(dbLot.description);
            hotspot.$.url = formatPriceForHotspot(dbLot.url, skinid, currency, rate);
          }
        });

        // Builder options to preserve format
        const builder = new xml2js.Builder();
        const xml = builder.buildObject(result);

        const targetFile = fs.existsSync(templateXmlPath) ? templateXmlPath : publicXmlPath;
        await fs.promises.writeFile(targetFile, xml);
        console.log(`Successfully synced ${dbLots.length} database lots to ${path.basename(targetFile)} (Node: ${nodeId})`);
      } else {
        console.warn(`Panorama with id "${nodeId}" has no hotspots to sync`);
      }
    } else {
      console.warn('No main panorama found in tour XML for sync');
    }
  } catch (error) {
    console.error('Error in syncDatabaseToXML:', error);
    throw error;
  }
};

const updateHotspotAttributes = async (hotspotId, description, status, newInfo) => {
  try {
    // 1. Update/Upsert the single lot in Supabase
    const { error: dbError } = await supabase
      .from('lots')
      .upsert({
        id: hotspotId,
        description,
        skinid: status,
        url: newInfo,
        updated_at: new Date().toISOString()
      });

    if (dbError) {
      console.error('Error saving lot to Supabase:', dbError);
      return dbError.message;
    }

    // 2. Fetch all lots from database to synchronize the local XML file in one pass
    const { data: dbLots, error: fetchError } = await supabase
      .from('lots')
      .select('*');

    if (fetchError) {
      console.error('Error fetching all lots for sync:', fetchError);
      return fetchError.message;
    }

    // 3. Write back to local XML (try/catch for read-only systems)
    try {
      await syncDatabaseToXML(dbLots);
    } catch (writeError) {
      console.warn('Non-fatal: Could not write updated XML to local filesystem (likely read-only environment like Vercel).', writeError.message);
    }
    return null;
  } catch (error) {
    console.error('Error in updateHotspotAttributes:', error);
    return error.message;
  }
};

// Fetch lots from database (acting as the source of truth)
const getAllHotspots = async () => {
  try {
    const { data: dbLots, error } = await supabase
      .from('lots')
      .select('*');

    if (error) {
      console.error('Error retrieving lots from Supabase:', error);
      throw error;
    }

    const excludedIds = ['point01', 'point02', 'point03', 'point04', 'point05', 'point25', 'config_currency'];
    let formattedLots = (dbLots || [])
      .filter(lot => lot.id && !excludedIds.includes(lot.id.toLowerCase()))
      .map(lot => ({
        id: lot.id || '',
        tilt: lot.tilt || '',
        url: lot.url || '',
        skinid: lot.skinid || '',
        title: lot.title || '',
        pan: lot.pan || '',
        description: lot.description || ''
      }));

    // If database has no real lots, read from XML and migrate to Supabase
    if (formattedLots.length === 0) {
      console.log('No lots found in Supabase lots table. Auto-seeding from pano.xml...');
      const xmlLots = await getAllHotspotsFromXML();
      if (xmlLots.length > 0) {
        formattedLots = xmlLots;
        try {
          await supabase.from('lots').upsert(xmlLots);
          console.log(`Auto-seeded ${xmlLots.length} lots to Supabase`);
        } catch (upsertErr) {
          console.error('Auto-seed Supabase error:', upsertErr);
        }
      }
    }

    // Natural alphanumeric sorting (handles E04-1, E04-13, etc.)
    formattedLots.sort((a, b) => {
      return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });

    return formattedLots;
  } catch (error) {
    console.error('Error in getAllHotspots:', error);
    throw error;
  }
};

// Parse initial hotspots from pano.xml
const getAllHotspotsFromXML = async () => {
  try {
    const result = await getData();
    const panorama = getMainPanorama(result);
    
    if (panorama && panorama.hotspots && panorama.hotspots[0].hotspot) {
      const excludedIds = ['point01', 'point02', 'point03', 'point04', 'point05', 'point25', 'config_currency'];
      const uniqueLots = new Map();

      panorama.hotspots[0].hotspot.forEach(h => {
        const id = h.$.id || '';
        const idLower = id.toLowerCase();
        
        // Exclude general navigation points and de-duplicate by ID
        if (!excludedIds.includes(idLower) && !uniqueLots.has(idLower)) {
          uniqueLots.set(idLower, {
            id: id,
            tilt: h.$.tilt || '',
            url: h.$.url || '',
            skinid: h.$.skinid || '',
            title: h.$.title || '',
            pan: h.$.pan || '',
            description: h.$.description || ''
          });
        }
      });

      return Array.from(uniqueLots.values());
    }
    return [];
  } catch (error) {
    console.error('Error reading initial hotspots from XML:', error);
    return [];
  }
};

// Startup synchronization function
const syncLotsOnStartup = async () => {
  try {
    // Query existing lots in database
    const { data: dbLots, error } = await supabase
      .from('lots')
      .select('*');

    if (error) {
      console.error('Error checking lots database status on startup:', error);
      return;
    }

    const realLots = (dbLots || []).filter(l => l.id && !['point01', 'point02', 'point03', 'point04', 'point05', 'point25', 'config_currency'].includes(l.id.toLowerCase()));

    if (realLots.length === 0) {
      console.log('Supabase lots table has no lot records. Performing migration from pano.xml...');
      const xmlLots = await getAllHotspotsFromXML();

      if (xmlLots.length > 0) {
        const lotsToInsert = xmlLots.map(lot => ({
          id: lot.id,
          tilt: lot.tilt,
          url: lot.url,
          skinid: lot.skinid,
          title: lot.title,
          pan: lot.pan,
          description: lot.description
        }));

        const { error: insertError } = await supabase
          .from('lots')
          .upsert(lotsToInsert);

        if (insertError) {
          console.error('Failed to migrate lots to Supabase:', insertError);
        } else {
          console.log(`Successfully migrated ${lotsToInsert.length} lots from pano.xml to Supabase.`);
        }
      } else {
        console.warn('No hotspots found in local pano.xml to migrate.');
      }
    } else {
      console.log(`Database has ${realLots.length} lots. Syncing them to local pano.xml to ensure persistence...`);
      await syncDatabaseToXML(dbLots);
    }
  } catch (err) {
    console.error('Exception during startup lots synchronization:', err);
  }
};

const exportDataToJSON = async (filePath) => {
  try {
    const hotspots = await getAllHotspots();
    const jsonData = JSON.stringify(hotspots, null, 2);
    await fs.promises.writeFile(filePath, jsonData);
    console.log('Datos exportados correctamente desde la base de datos');
  } catch (error) {
    console.error('Error exportando datos:', error);
  }
};

const importDataFromJSON = async (filePath) => {
  try {
    const jsonData = await fs.promises.readFile(filePath, 'utf-8');
    const hotspots = JSON.parse(jsonData);

    for (const hotspot of hotspots) {
      await updateHotspotAttributes(hotspot.id, hotspot.description, hotspot.skinid, hotspot.url);
    }
    console.log('Datos importados correctamente a la base de datos y sincronizados');
  } catch (error) {
    console.error('Error importando datos:', error);
  }
};

// Generate updated XML on the fly without writing to disk
const generateDynamicXML = async () => {
  try {
    const result = await getData();
    const panorama = getMainPanorama(result);
    
    if (panorama && panorama.hotspots && panorama.hotspots[0].hotspot) {
      const hotspots = panorama.hotspots[0].hotspot;
      
      // Fetch latest lot values from Supabase
      const { data: dbLots, error } = await supabase
        .from('lots')
        .select('*');

      if (!error && dbLots && dbLots.length > 0) {
        let currency = 'UF';
        const configData = dbLots.find(l => l.id === 'CONFIG_CURRENCY');
        if (configData) {
          currency = configData.url || 'UF';
        }
        
        const rate = await fetchUFValue();

        // Map db values to template hotspots
        hotspots.forEach((hotspot) => {
          const id = hotspot.$.id || '';
          if (id.toLowerCase() === 'config_currency') return;
          const dbLot = dbLots.find(l => l.id.toLowerCase() === id.toLowerCase());
          if (dbLot) {
            let skinid = dbLot.skinid || '';
            if (skinid.toLowerCase() === 'ht_nodisponible') {
              skinid = 'ht_noDisponible';
            }
            hotspot.$.skinid = skinid;
            hotspot.$.description = cleanDescriptionForXML(dbLot.description);
            hotspot.$.url = formatPriceForHotspot(dbLot.url, skinid, currency, rate);
          }
        });
      }

      // Build updated XML string in memory
      const builder = new xml2js.Builder();
      return builder.buildObject(result);
    }
    
    // Return template raw file fallback if parsed object is empty
    const targetFile = fs.existsSync(templateXmlPath) ? templateXmlPath : publicXmlPath;
    return await fs.promises.readFile(targetFile, 'utf-8');
  } catch (error) {
    console.error('Error generating dynamic XML:', error);
    throw error;
  }
};

module.exports = {
  updateHotspotAttributes,
  getAllHotspots, 
  getAllHotspotsFromXML,
  exportDataToJSON,
  importDataFromJSON,
  syncLotsOnStartup,
  generateDynamicXML
};

import { storeChunkedMap } from './storageUtils';
import { createMap } from './mapService';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../firebase';
import { searchGithubModels } from './miniManifest';

export const fetchMonsterFrom5eApi = async (monsterName) => {
    if (!monsterName || monsterName.toLowerCase() === 'unknown') return null;
    try {
        const res = await fetch(`https://www.dnd5eapi.co/api/monsters?name=${encodeURIComponent(monsterName)}`);
        const data = await res.json();
        if (data.count > 0) {
            const match = data.results.find(r => r?.name?.toLowerCase() === monsterName?.toLowerCase()) || data.results[0];
            const detailRes = await fetch(`https://www.dnd5eapi.co${match.url}`);
            const m = await detailRes.json();
            
            const acVal = Array.isArray(m.armor_class) ? m.armor_class[0].value : m.armor_class;
            const speedStr = typeof m.speed === 'object' ? Object.entries(m.speed).map(([k,v]) => `${k} ${v}`).join(', ') : m.speed;

            const getMod = (score) => Math.floor((score - 10) / 2);
            const modifiers = {
                str: getMod(m.strength), dex: getMod(m.dexterity), con: getMod(m.constitution),
                int: getMod(m.intelligence), wis: getMod(m.wisdom), cha: getMod(m.charisma)
            };

            const mapAction = (a, type) => {
                let dmgString = (a.damage || []).map(d => `${d.damage_dice || ''} ${d.damage_type?.name || ''}`).join(' + ').trim();
                let hitString = a.attack_bonus ? `+${a.attack_bonus}` : "";
                let dcString = a.dc ? `DC ${a.dc.dc_value} ${a.dc.dc_type?.name || ''}` : "";
                return {
                    name: a.name + (a.usage ? ` (${a.usage.type} ${a.usage.times || a.usage.dice || ''})` : ""),
                    desc: a.desc || "",
                    type: type,
                    category: "Attack",
                    hit: hitString || dcString,
                    dmg: dmgString
                };
            };

            return {
                id: Date.now(),
                isHidden: true,
                name: m.name,
                race: `${m.size} ${m.type} (${m.alignment})`,
                class: "Monster",
                level: m.challenge_rating,
                hp: { current: m.hit_points, max: m.hit_points },
                ac: acVal,
                speed: speedStr,
                stats: { str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma },
                modifiers: modifiers,
                image: m.image ? `https://www.dnd5eapi.co${m.image}` : null,
                quirk: "SRD Import",
                bio: { backstory: `Imported from D&D 5e API.\nXP: ${m.xp}`, appearance: `A ${m.size} ${m.type}.` },
                customActions: [
                    ...(m.actions || []).map(a => mapAction(a, 'Action')),
                    ...(m.legendary_actions || []).map(a => mapAction(a, 'Legendary Action')),
                    ...(m.reactions || []).map(a => mapAction(a, 'Reaction'))
                ],
                features: (m.special_abilities || []).map(f => ({ name: f.name, desc: f.desc, source: "Trait" }))
            };
        }
    } catch (e) {}
    return null;
};

export const fulfillMapData = async ({
    imgUrl,
    targetMap,
    campaignCode,
    skeleton,
    data,
    aiHelper,
    generateNpc,
    updateCampaign,
    setProcessingStep
}) => {
    // 1. Determine Environment via AI
    const chapter = skeleton.chapters.find(c => c.id === targetMap.chapterId);
    let environment = 'day';
    let lightingIntensity = 1;
    let ambientLifeLevel = 'off';

    if (chapter) {
        const envPrompt = `Analyze this D&D chapter: "${chapter.title}". The maps include: ${chapter.maps?.map(m=>m.name).join(', ') || ''}. The monsters include: ${chapter.monsters?.map(m=>m.name).join(', ') || ''}. What is the likely environment? Reply with ONLY ONE WORD from this list: day, night, sunset, fog, rain, snow, ash, spores, swamp.`;
        const envRes = await aiHelper([{ role: 'user', content: envPrompt }]);
        
        const envMatch = envRes?.toLowerCase().match(/(day|night|sunset|fog|rain|snow|ash|spores|swamp)/);
        if (envMatch) environment = envMatch[0];

        if (environment === 'night' || environment === 'swamp' || environment === 'ash') lightingIntensity = 0.4;
        else if (environment === 'fog' || environment === 'sunset' || environment === 'spores') lightingIntensity = 0.7;
        
        if (environment !== 'day' && environment !== 'night') ambientLifeLevel = 'low';
    }

    // 2. Fetch and Store Image
    if (setProcessingStep) setProcessingStep('Downloading & chunking map texture...');
    let base64data = imgUrl; 
    if (!imgUrl.startsWith('data:image')) {
        const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(imgUrl)}&cors=1`;
        const res = await fetch(proxyUrl);
        const blob = await res.blob();
        base64data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    }
    
    const chunkedId = await storeChunkedMap(base64data, targetMap.name);
    
    // Add to Assets
    const assetsRef = collection(db, 'artifacts', appId || 'dungeonmind', 'public', 'data', 'campaigns', campaignCode, 'assets');
    await addDoc(assetsRef, {
        name: targetMap.name,
        url: chunkedId,
        category: 'Maps',
        createdAt: serverTimestamp()
    });

    // 3. Process Bestiary & Auto-Populate Tokens
    if (setProcessingStep) setProcessingStep('Populating bestiary & scattering tokens...');
    const tokens = {};
    let currentNpcs = [...(data?.npcs || [])];
    let campaignUpdated = false;
    let totalTokenIndex = 0;
    const cols = 4;
    const gridSpacing = 2; // Grid units

    const requiredMonsters = targetMap.monsters || (chapter ? chapter.monsters : []) || [];
    if (requiredMonsters.length > 0) {
        for (const requiredMonster of requiredMonsters) {
            if (!requiredMonster?.name || requiredMonster.name.toLowerCase() === 'unknown') continue;
            let npcData = currentNpcs.find(n => n?.name?.toLowerCase() === requiredMonster.name.toLowerCase());

            if (!npcData) {
                try {
                    if (setProcessingStep) setProcessingStep(`Searching 5e Archives for: ${requiredMonster.name}...`);
                    let newNpc = await fetchMonsterFrom5eApi(requiredMonster.name);

                    if (newNpc) {
                        if (setProcessingStep) setProcessingStep(`Found ${requiredMonster.name} in 5e API! Formatting...`);
                    } else {
                        if (setProcessingStep) setProcessingStep(`Forging missing monster: ${requiredMonster.name} with AI...`);
                        newNpc = await generateNpc(requiredMonster.name, `Standard 5e Statblock for Map: ${targetMap.name}`);
                    }

                    if (newNpc) {
                        if (!newNpc.image) {
                            if (setProcessingStep) setProcessingStep(`Generating token art for ${requiredMonster.name}...`);
                            const imagePrompt = `Dungeons and dragons official digital character illustration of a ${newNpc.name} ${newNpc.race || ''}. 2D fantasy character concept art, flat colors, solid white background, stylized token art, not photorealistic.`;
                            let imageUrl = null;
                            if (window.puter?.ai?.txt2img) {
                                try {
                                    const imgEl = await window.puter.ai.txt2img(imagePrompt, { provider: 'replicate-image-generation', model: 'black-forest-labs/flux-schnell', ratio: { w: 1, h: 1 } });
                                    const response = await fetch(imgEl.src);
                                    const blob = await response.blob();
                                    imageUrl = await new Promise((resolve) => {
                                        const reader = new FileReader();
                                        reader.onloadend = () => resolve(reader.result);
                                        reader.readAsDataURL(blob);
                                    });
                                } catch (e) {
                                    console.error("Puter image gen failed", e);
                                }
                            }
                            newNpc.image = imageUrl || `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
                        }
                        if (!newNpc.model3d) {
                            if (setProcessingStep) setProcessingStep(`Selecting 3D model for ${requiredMonster.name}...`);
                            let results = await searchGithubModels(newNpc.name);
                            if (results.length === 0 && newNpc.race) results = await searchGithubModels(newNpc.race);
                            if (results.length > 0) newNpc.model3d = results[0].url;
                        }
                        npcData = { ...newNpc, id: `char_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` };
                        currentNpcs.push(npcData);
                        campaignUpdated = true;
                    }
                } catch (e) {
                    console.error(`Failed to generate NPC ${requiredMonster.name}`, e);
                }
            }

            if (npcData) {
                const count = requiredMonster.count || 1;
                for (let i = 0; i < count; i++) {
                    const row = Math.floor(totalTokenIndex / cols);
                    const col = totalTokenIndex % cols;
                    const offsetX = (col - Math.floor(cols / 2)) * gridSpacing;
                    const offsetZ = row * gridSpacing;

                    const tokenId = `token_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 9)}`;
                    tokens[tokenId] = {
                        id: tokenId,
                        characterId: npcData.id,
                        x: offsetX,
                        z: offsetZ,
                        hp: { current: npcData.hp?.max || 10, max: npcData.hp?.max || 10 }
                    };
                    totalTokenIndex++;
                }
            }
        }
    }

    // 4. Process Lore Pins
    if (setProcessingStep) setProcessingStep('Dropping 3D lore pins...');
    const pings = {};
    
    const requiredLores = targetMap.lore || (chapter ? chapter.lore : []) || [];
    if (requiredLores.length > 0) {
        const loreCount = requiredLores.length;
        const loreSpread = 4;
        
        for (let i = 0; i < loreCount; i++) {
            const requiredLore = requiredLores[i];
            if (!requiredLore?.name || requiredLore.name.toLowerCase() === 'unknown') continue;
            const angle = (i / loreCount) * Math.PI * 2;
            const offsetX = Math.cos(angle) * loreSpread;
            const offsetZ = Math.sin(angle) * loreSpread;
            
            const pingId = `ping_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            pings[pingId] = {
                id: pingId,
                x: offsetX,
                z: offsetZ,
                color: '#eab308',
                label: requiredLore.name,
                content: `To find the true text for "${requiredLore.name}", search the Archives...`,
                isLore: true
            };
        }
    }

    // Create Map Document
    if (setProcessingStep) setProcessingStep('Finalizing Scene JSON...');
    const newMapId = `map_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await createMap(campaignCode, newMapId, {
        name: targetMap.name,
        backgroundUrl: chunkedId,
        gridSize: 1,
        scale: 20,
        environment: environment,
        lightingIntensity: lightingIntensity,
        ambientLifeLevel: ambientLifeLevel,
        chapterId: targetMap.chapterId,
        tokens: tokens,
        pings: pings
    });

    // Update Module Skeleton status
    const newSkeleton = JSON.parse(JSON.stringify(skeleton));
    const updatedChapter = newSkeleton.chapters.find(c => c.id === targetMap.chapterId);
    if (updatedChapter) {
        const mapEntry = updatedChapter.maps.find(m => m.id === targetMap.id);
        if (mapEntry) {
            mapEntry.status = 'ready';
            mapEntry.mapUrl = chunkedId;
            mapEntry.activeMapId = newMapId;
        }
        
        const monstersToUpdate = mapEntry?.monsters || updatedChapter.monsters || [];
        monstersToUpdate.forEach(m => {
            if (!m?.name) return;
            const tokenCreated = Object.values(tokens).some(t => {
                const c = currentNpcs.find(npc => String(npc.id) === String(t.characterId));
                return c && c?.name?.toLowerCase() === m.name.toLowerCase();
            });
            if (tokenCreated) m.status = 'ready';
        });
        
        const loreToUpdate = mapEntry?.lore || updatedChapter.lore || [];
        loreToUpdate.forEach(l => {
           if (!l?.name) return;
           const pinCreated = Object.values(pings).some(p => p.label === l.name);
           if (pinCreated) l.status = 'ready';
        });
    }

    const campaignUpdates = { 'moduleSkeleton': newSkeleton };
    if (campaignUpdated) {
        campaignUpdates.npcs = currentNpcs;
    }

    await updateCampaign(campaignUpdates);
    return newMapId;
};

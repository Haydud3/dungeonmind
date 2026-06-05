import React, { useState } from 'react';
import Icon from './Icon';
import { fulfillMapData } from '../utils/moduleFulfillment';

const MapSourcingModal = ({ sourcingMap, onClose, campaignCode, skeleton, updateCampaign, data, aiHelper, generateNpc }) => {
    const [redditResults, setRedditResults] = useState([]);
    const [isSourcing, setIsSourcing] = useState(false);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [isProcessingMap, setIsProcessingMap] = useState(false);
    const [processingStep, setProcessingStep] = useState('');
    const fileInputRef = React.useRef(null);

    React.useEffect(() => {
        if (sourcingMap) {
            fetchRedditMaps(sourcingMap);
        }
    }, [sourcingMap]);

    const handleMapUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onloadend = () => {
            acceptMap(reader.result);
            e.target.value = null;
        };
        reader.readAsDataURL(file);
    };

    const localAiHelper = async (messages) => {
        if (typeof aiHelper === 'function') {
            const res = await aiHelper(messages);
            let extracted = res;
            if (typeof res === 'string') return res;
            if (res?.message?.content) extracted = res.message.content;
            else if (typeof res?.response?.text === 'function') extracted = await res.response.text();
            else if (typeof res?.text === 'function') extracted = await res.text();
            else if (res?.text) extracted = res.text;
            return typeof extracted === 'string' ? extracted : JSON.stringify(extracted);
        }
        
        try {
            if (window.puter?.ai?.chat) {
                const promptString = Array.isArray(messages) ? messages.map(m => m.content).join('\n') : messages;
                const response = await window.puter.ai.chat(promptString);
                let extracted = response;
                if (typeof response === 'string') return response;
                if (response?.message?.content) extracted = response.message.content;
                else if (typeof response?.response?.text === 'function') extracted = await response.response.text();
                else if (typeof response?.text === 'function') extracted = await response.text();
                else if (response?.text) extracted = response.text;
                return typeof extracted === 'string' ? extracted : JSON.stringify(extracted);
            }
        } catch (e) {
            console.error("Fallback AI failed", e);
        }
        console.warn("AI functions are not available in this view.");
        return null;
    };

    const localGenerateNpc = async (monsterName, instruction) => {
        if (!monsterName || monsterName.toLowerCase() === 'unknown') return null;
        if (typeof generateNpc === 'function') return generateNpc(monsterName, instruction);
        
        try {
            const res = await fetch(`https://www.dnd5eapi.co/api/monsters?name=${encodeURIComponent(monsterName)}`);
            const dataApi = await res.json();
            if (dataApi.count > 0) {
                const match = dataApi.results.find(r => r?.name?.toLowerCase() === monsterName?.toLowerCase()) || dataApi.results[0];
                const detailRes = await fetch(`https://www.dnd5eapi.co${match.url}`);
                const m = await detailRes.json();
                
                let imageUrl = null;
                if (m.image) {
                    imageUrl = `https://www.dnd5eapi.co${m.image}`;
                } else {
                    const imagePrompt = `Dungeons and dragons official digital character illustration of a ${m.name}. 2D fantasy character concept art, flat colors, solid white background, stylized token art, not photorealistic.`;
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
                    if (!imageUrl) {
                        imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
                    }
                }
                
                return {
                    id: Date.now(),
                    name: m.name,
                    hp: { current: m.hit_points || 10, max: m.hit_points || 10 },
                    ac: Array.isArray(m.armor_class) ? m.armor_class[0].value : m.armor_class,
                    image: imageUrl
                };
            }
        } catch (e) {
            console.error("5e API error", e);
        }
        
        const prompt = `Role: Fantasy bestiary writer. Task: Create a D&D 5e statblock for "${monsterName}". ${instruction || ''}\nOutput ONLY valid JSON.\n{\n  "name": "${monsterName}",\n  "race": "Medium Humanoid (Any Alignment)",\n  "class": "Monster",\n  "stats": { "str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10 },\n  "hp": { "current": 15, "max": 15 },\n  "ac": 12,\n  "speed": "30 ft.",\n  "bio": { "appearance": "...", "backstory": "..." },\n  "customActions": [{ "name": "Shortsword", "desc": "Melee Weapon Attack", "type": "Action", "hit": "+4", "dmg": "1d6+2" }]\n}`;
        try {
            const res = await localAiHelper([{ role: 'user', content: prompt }]);
            if (!res) return null;
            const match = res.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(match[0]);
            
            const imagePrompt = `Dungeons and dragons official digital character illustration of a ${parsed.name} ${parsed.race || ''}. 2D fantasy character concept art, flat colors, solid white background, stylized token art, not photorealistic.`;
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
            parsed.image = imageUrl || `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;
            
            return parsed;
        } catch (e) {
            console.error("AI Generation failed", e);
        }
        return null;
    };

    const fetchRedditMaps = async (mapObj) => {
        setIsSourcing(true);
        setRedditResults([]);
        setCurrentImageIndex(0);
        try {
            const query = encodeURIComponent(mapObj.name);
            const urls = [
                `https://corsproxy.io/?https://www.reddit.com/r/battlemaps/search.json?q=${query}&restrict_sr=1&limit=10`,
                `https://corsproxy.io/?https://www.reddit.com/r/dndmaps/search.json?q=${query}&restrict_sr=1&limit=10`
            ];
            
            let hits = [];
            for (const url of urls) {
                try {
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    
                    const json = await res.json();
                    
                    if (json?.data?.children) {
                        json.data.children.forEach(child => {
                            const post = child.data;
                            if (post.url && post.url.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
                                hits.push({
                                    title: post.title,
                                    url: post.url,
                                    author: post.author,
                                    permalink: `https://reddit.com${post.permalink}`
                                });
                            }
                        });
                    }
                } catch(e) { console.error(e) }
            }
            setRedditResults(hits);
        } catch (e) {
            console.error("Reddit fetch failed", e);
            alert("Failed to find maps. CORS or network error.");
        }
        setIsSourcing(false);
    };

    const acceptMap = async (imgUrl) => {
        if (!campaignCode) return alert("Missing campaign code.");
        
        setIsProcessingMap(true);
        try {
            const newMapId = await fulfillMapData({
                imgUrl,
                targetMap: sourcingMap,
                campaignCode,
                skeleton,
                data: {...data,
                    npcs: (data?.npcs || []).filter(n => n && n.name),
                    players: (data?.players || []).filter(p => p && p.name)
                },
                aiHelper: localAiHelper,
                generateNpc: localGenerateNpc,
                updateCampaign,
                setProcessingStep
            });

            alert(`Map "${sourcingMap.name}" imported successfully!\n\nTokens and Lore Pins have been placed. Remember to open the Tactical Map and use the [Detect Grid Size] and [Architect Mask] tools to automatically align the map and generate walls!`);
            
            setProcessingStep('Populating Entities...');
            await new Promise(r => setTimeout(r, 3500));

            // Auto open the map
            await updateCampaign({ activeMapId: newMapId });
            
            onClose();
        } catch (e) {
            console.error("Accept map failed", e);
            alert("Failed to process and save map.");
        } finally {
            setIsProcessingMap(false);
            setProcessingStep('');
        }
    };

    if (!sourcingMap) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-6 backdrop-blur-sm animate-in zoom-in-95">
            <div className="max-w-4xl w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-full relative">
                
                {/* Header */}
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 shrink-0">
                    <div>
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Icon name="search" size={16} className="text-amber-500" />
                            Sourcing Map: {sourcingMap.name}
                        </h3>
                        <p className="text-slate-400 text-sm">Searching Reddit (/r/battlemaps, /r/dndmaps)</p>
                    </div>
                    <button onClick={onClose} disabled={isProcessingMap} className="text-slate-400 hover:text-white transition-colors p-2 disabled:opacity-50">
                        <Icon name="x" size={20} />
                    </button>
                </div>

                {/* Sourcing / Processing Overlay */}
                <div className="flex-1 overflow-hidden relative flex flex-col bg-slate-950/50 min-h-[400px]">
                    {isProcessingMap ? (
                        <div className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur flex flex-col items-center justify-center">
                            <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(245,158,11,0.5)]"></div>
                            <h3 className="text-2xl font-bold text-white mb-2 tracking-wider">Forging Scene</h3>
                            <p className="text-amber-400 animate-pulse font-mono bg-black/50 px-4 py-2 rounded border border-amber-500/20">{processingStep}</p>
                        </div>
                    ) : isSourcing ? (
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <Icon name="loader" size={32} className="animate-spin text-amber-500 mb-4" />
                            <p className="text-slate-300 animate-pulse">Scouring the archives...</p>
                        </div>
                    ) : redditResults.length > 0 ? (
                        <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden group">
                            <img src={`https://wsrv.nl/?url=${encodeURIComponent(redditResults[currentImageIndex].url)}&cors=1&w=1024`} className="max-h-full max-w-full object-contain shadow-2xl rounded" alt="Map Preview" />
                            
                            {/* Controls */}
                            <div className="absolute inset-y-0 left-0 flex items-center p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => setCurrentImageIndex(prev => prev > 0 ? prev - 1 : redditResults.length - 1)}
                                    className="p-3 bg-black/80 text-white rounded-full hover:bg-amber-600 transition-colors shadow-lg border border-slate-700 hover:border-amber-500"
                                >
                                    <Icon name="chevron-left" size={24} />
                                </button>
                            </div>
                            <div className="absolute inset-y-0 right-0 flex items-center p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => setCurrentImageIndex(prev => prev < redditResults.length - 1 ? prev + 1 : 0)}
                                    className="p-3 bg-black/80 text-white rounded-full hover:bg-amber-600 transition-colors shadow-lg border border-slate-700 hover:border-amber-500"
                                >
                                    <Icon name="chevron-right" size={24} />
                                </button>
                            </div>

                            {/* Caption */}
                            <div className="absolute bottom-4 left-4 right-4 text-center">
                                <div className="inline-block bg-black/80 border border-slate-700 backdrop-blur-md rounded-lg p-3 shadow-2xl">
                                    <p className="text-white font-bold text-sm truncate">{redditResults[currentImageIndex].title}</p>
                                    <p className="text-slate-400 text-xs mt-1">by u/{redditResults[currentImageIndex].author} • Result {currentImageIndex + 1} of {redditResults.length}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-500 p-6">
                            <Icon name="search-x" size={48} className="mx-auto mb-4 opacity-50" />
                            <p>No suitable maps found.</p>
                            <button 
                                 onClick={() => window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery + ' dnd battlemap')}`, '_blank')}
                                 className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-colors shadow-lg flex items-center justify-center gap-2 mx-auto"
                            >
                                 <Icon name="external-link" size={16} /> Search Google Images
                            </button>
                            <p className="text-xs mt-4">Or try a manual upload below.</p>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t border-slate-800 bg-slate-900 shrink-0 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleMapUpload} 
                            accept="image/*, video/mp4, video/webm" 
                            className="hidden" 
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isProcessingMap}
                            className="px-4 py-2.5 bg-slate-800 border border-slate-700 hover:border-amber-500 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-2 text-sm w-full sm:w-auto justify-center disabled:opacity-50"
                        >
                            <Icon name="upload" size={16} /> Upload Custom
                        </button>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <span className="text-[10px] text-slate-500 font-mono hidden sm:inline-block">Powered by Reddit API & wsrv.nl proxy</span>
                        {redditResults.length > 0 && !isSourcing && (
                            <button
                                onClick={() => acceptMap(redditResults[currentImageIndex].url)}
                                disabled={isProcessingMap}
                                className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold rounded-lg shadow-lg transition-colors flex items-center gap-2 w-full sm:w-auto justify-center"
                            >
                                {isProcessingMap ? <Icon name="loader" size={16} className="animate-spin" /> : <Icon name="download" size={16} />}
                                {isProcessingMap ? 'Importing Scene...' : 'Accept & Import Map'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MapSourcingModal;
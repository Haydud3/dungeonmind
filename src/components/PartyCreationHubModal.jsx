import React, { useState } from 'react';
import Icon from './Icon';
import { useToast } from './ToastProvider';
import { parsePdf } from '../utils/dndBeyondParser.js';
import { enrichCharacter } from '../utils/srdEnricher.js';

export const PartyCreationHubModal = ({
    isOpen,
    onClose,
    onSelectBuilder,
    onSelectDndBeyond,
    onSelectQuickHero,
    onCharacterCreated,
    generatePlayer,
    aiHelper
}) => {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState('hub'); // 'hub' | 'ai' | 'pdf'
    const [aiHeroName, setAiHeroName] = useState('');
    const [aiHeroContext, setAiHeroContext] = useState('');
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);
    const [isParsingPdf, setIsParsingPdf] = useState(false);

    if (!isOpen) return null;

    const handleAiGenerate = async () => {
        if (!aiHeroName.trim()) {
            toast("Please enter a character name.", "warning");
            return;
        }
        if (!generatePlayer) {
            toast("AI Player generator is unavailable.", "error");
            return;
        }

        setIsGeneratingAi(true);
        try {
            const context = aiHeroContext.trim() || "5e adventurer with standard starting equipment and balanced stats";
            const generated = await generatePlayer(aiHeroName.trim(), context);
            if (generated) {
                onCharacterCreated(generated);
                onClose();
                toast(`Summoned ${generated.name}!`, "success");
            } else {
                toast("AI hero generation failed. Please try again.", "error");
            }
        } catch (e) {
            console.error("AI Hero Gen error:", e);
            toast("Error generating hero: " + e.message, "error");
        }
        setIsGeneratingAi(false);
    };

    const handlePdfFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsParsingPdf(true);
        try {
            const rawData = await parsePdf(file);
            const enriched = await enrichCharacter(rawData);
            onCharacterCreated(enriched);
            onClose();
            toast(`Successfully imported ${enriched.name} from PDF!`, "success");
        } catch (err) {
            console.error(err);
            toast("PDF Import Failed: " + err.message, "error");
        }
        setIsParsingPdf(false);
        e.target.value = null;
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
                
                {/* Header */}
                <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            <Icon name="user-plus" size={20}/>
                        </div>
                        <div>
                            <h2 className="text-xl fantasy-font text-white flex items-center gap-2">
                                Summon a Hero
                            </h2>
                            <p className="text-xs text-slate-400">Choose how you would like to bring a new hero into your party.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <Icon name="x" size={20}/>
                    </button>
                </div>

                {/* Hub Options */}
                <div className="p-6 overflow-y-auto max-h-[75vh]">
                    {activeTab === 'hub' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            {/* 1. Native Character Builder */}
                            <div
                                onClick={() => { onClose(); onSelectBuilder(); }}
                                className="bg-slate-800/80 hover:bg-slate-750 border border-slate-700 hover:border-indigo-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-0.5 shadow-md flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center gap-2.5 mb-2">
                                        <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 group-hover:scale-105 transition-transform">
                                            <Icon name="pen-tool" size={18}/>
                                        </div>
                                        <h3 className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors">
                                            Character Builder
                                        </h3>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        Guided 5e step-by-step character creator. Choose race, class, background, ability scores, and starting equipment.
                                    </p>
                                </div>
                                <div className="mt-3 text-[11px] font-bold text-indigo-400 flex items-center gap-1 group-hover:underline">
                                    Launch Builder <Icon name="arrow-right" size={12}/>
                                </div>
                            </div>

                            {/* 2. D&D Beyond Importer */}
                            <div
                                onClick={() => { onClose(); onSelectDndBeyond(); }}
                                className="bg-slate-800/80 hover:bg-slate-750 border border-slate-700 hover:border-blue-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-0.5 shadow-md flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center gap-2.5 mb-2">
                                        <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 group-hover:scale-105 transition-transform">
                                            <Icon name="download" size={18}/>
                                        </div>
                                        <h3 className="font-bold text-white text-sm group-hover:text-blue-300 transition-colors">
                                            D&amp;D Beyond Sync
                                        </h3>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        1-click sync using a D&amp;D Beyond character URL or ID. Pulls complete stats, inventory, spells, and features.
                                    </p>
                                </div>
                                <div className="mt-3 text-[11px] font-bold text-blue-400 flex items-center gap-1 group-hover:underline">
                                    Import Beyond Sheet <Icon name="arrow-right" size={12}/>
                                </div>
                            </div>

                            {/* 3. AI Hero Forge */}
                            <div
                                onClick={() => setActiveTab('ai')}
                                className="bg-slate-800/80 hover:bg-slate-750 border border-slate-700 hover:border-purple-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-0.5 shadow-md flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center gap-2.5 mb-2">
                                        <div className="p-2 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-500/30 group-hover:scale-105 transition-transform">
                                            <Icon name="sparkles" size={18}/>
                                        </div>
                                        <h3 className="font-bold text-white text-sm group-hover:text-purple-300 transition-colors">
                                            AI Hero Creator
                                        </h3>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        Describe a character concept, archetype, or backstory and let the AI generate complete 5e stats, features, and art.
                                    </p>
                                </div>
                                <div className="mt-3 text-[11px] font-bold text-purple-400 flex items-center gap-1 group-hover:underline">
                                    Forge with AI <Icon name="arrow-right" size={12}/>
                                </div>
                            </div>

                            {/* 4. Quick Token (Fast Photo & Name) */}
                            <div
                                onClick={() => { onClose(); onSelectQuickHero(); }}
                                className="bg-slate-800/80 hover:bg-slate-750 border border-slate-700 hover:border-amber-500 rounded-xl p-4 cursor-pointer group transition-all hover:-translate-y-0.5 shadow-md flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center gap-2.5 mb-2">
                                        <div className="p-2 rounded-lg bg-amber-600/20 text-amber-400 border border-amber-500/30 group-hover:scale-105 transition-transform">
                                            <Icon name="zap" size={18}/>
                                        </div>
                                        <h3 className="font-bold text-white text-sm group-hover:text-amber-300 transition-colors">
                                            Quick Token
                                        </h3>
                                    </div>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        Fast name and portrait token. Great for temporary guests, animal companions, sidekicks, or guest players.
                                    </p>
                                </div>
                                <div className="mt-3 text-[11px] font-bold text-amber-400 flex items-center gap-1 group-hover:underline">
                                    Create Quick Hero <Icon name="arrow-right" size={12}/>
                                </div>
                            </div>

                            {/* 5. PDF Upload (Spans full width) */}
                            <label className="sm:col-span-2 bg-slate-800/60 hover:bg-slate-750 border border-dashed border-slate-700 hover:border-slate-500 rounded-xl p-3.5 cursor-pointer group transition-all flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                                        <Icon name="file-text" size={18}/>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white text-xs">Upload Fillable 5e PDF</h4>
                                        <p className="text-[10px] text-slate-400">Import directly from an official fifth edition fillable PDF character sheet.</p>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-3 py-1 rounded-lg">
                                    {isParsingPdf ? 'Parsing PDF...' : 'Choose PDF'}
                                </span>
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={handlePdfFile}
                                    className="hidden"
                                    disabled={isParsingPdf}
                                />
                            </label>
                        </div>
                    )}

                    {/* AI Hero Creator Form */}
                    {activeTab === 'ai' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <button
                                    onClick={() => setActiveTab('hub')}
                                    className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 font-bold"
                                >
                                    <Icon name="arrow-left" size={12}/> Back to Options
                                </button>
                                <span className="text-xs font-bold text-slate-400">AI Player Generator</span>
                            </div>

                            {isGeneratingAi ? (
                                <div className="py-12 text-center space-y-3">
                                    <div className="w-12 h-12 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin mx-auto"></div>
                                    <h4 className="font-bold text-purple-300 fantasy-font">Forging Player Character...</h4>
                                    <p className="text-xs text-slate-400">Generating ability scores, spell slots, inventory, and portrait art.</p>
                                </div>
                            ) : (
                                <div className="space-y-3.5">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1">
                                            Hero Name <span className="text-red-400">*</span>
                                        </label>
                                        <input
                                            autoFocus
                                            value={aiHeroName}
                                            onChange={e => setAiHeroName(e.target.value)}
                                            placeholder="e.g. Alistair Dawnseeker"
                                            className="w-full bg-slate-950/90 border border-slate-700 focus:border-purple-500 rounded-xl px-3 py-2 text-sm text-white outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 mb-1">
                                            Concept / Class / Lore Context
                                        </label>
                                        <textarea
                                            value={aiHeroContext}
                                            onChange={e => setAiHeroContext(e.target.value)}
                                            placeholder="e.g. Level 3 High Elf Bladesinger Wizard from an ancient royal guard, scholarly personality, wielding a rapier..."
                                            className="w-full bg-slate-950/90 border border-slate-700 focus:border-purple-500 rounded-xl p-3 text-xs text-slate-200 outline-none h-28 resize-none"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('hub')}
                                            className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleAiGenerate}
                                            disabled={!aiHeroName.trim()}
                                            className="px-5 py-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
                                        >
                                            <Icon name="sparkles" size={14}/> Generate Hero
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default PartyCreationHubModal;


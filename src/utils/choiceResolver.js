import { fetch5eData } from './5eDataUtils';

/**
 * Extracts the 5e-bits collection name from an API URL.
 * e.g., "/api/2024/skills" -> "Skills"
 * e.g., "/api/2014/equipment-categories/holy-symbols" -> "Equipment-Categories"
 */
export const urlToCollection = (url) => {
    if (!url) return null;
    const parts = url.split('/').filter(Boolean);
    if (parts.length < 3) return null;
    
    const category = parts[2];
    
    // Capitalize each word for the file name (e.g. "Equipment-Categories")
    return category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');
};

/**
 * Parses a ChoiceSchema object from 5e-bits into a normalized, UI-friendly structure.
 * 
 * @param {Object} choiceObj The raw ChoiceSchema object from the 5e JSON.
 * @param {string} ruleset '2014' or '2024'
 * @returns {Promise<Object>} A normalized choice object ready for the UI.
 */
export const resolveChoice = async (choiceObj, ruleset = '2024') => {
    if (!choiceObj || !choiceObj.from) return null;
    
    const { choose, type, desc, from } = choiceObj;
    let resolvedOptions = [];
    
    if (from.option_set_type === 'options_array') {
        resolvedOptions = from.options.map(opt => {
            // Handle simple string arrays
            if (typeof opt === 'string') return { label: opt, value: opt };
            
            // Handle complex option_type schemas
            switch(opt.option_type) {
                case 'reference':
                    return { label: opt.item.name, value: opt.item.index, data: opt.item };
                case 'string':
                    return { label: opt.string, value: opt.string };
                case 'ability_bonus':
                    return { label: `${opt.ability_score.name} +${opt.bonus}`, value: opt.ability_score.index, bonus: opt.bonus };
                case 'counted_reference':
                    return { label: `${opt.count}x ${opt.of.name}`, value: opt.of.index, count: opt.count, data: opt.of };
                case 'multiple':
                    const labels = opt.items.map(i => {
                        if (i.option_type === 'counted_reference') return `${i.count}x ${i.of.name}`;
                        if (i.option_type === 'money') return `${i.count} ${i.unit}`;
                        return 'Multiple Items';
                    });
                    return { label: labels.join(', '), value: opt.items, data: opt.items };
                case 'choice':
                    return { label: 'Nested Choice', value: opt.choice, isNested: true, data: opt.choice };
                case 'score_prerequisite':
                    return { label: `${opt.ability_score.name} >= ${opt.minimum_score}`, value: opt.ability_score.index, data: opt };
                case 'size':
                    return { label: opt.size, value: opt.size };
                default:
                    return { label: opt.option_type || 'Unknown Option', value: opt, data: opt };
            }
        });
    } else if (from.option_set_type === 'resource_list') {
        const collectionName = urlToCollection(from.resource_list_url);
        if (collectionName) {
            const data = await fetch5eData(ruleset, collectionName);
            resolvedOptions = data.map(item => ({ label: item.name, value: item.index, data: item }));
        }
    } else if (from.option_set_type === 'equipment_category') {
        const catIndex = from.equipment_category.index;
        const collectionName = urlToCollection(from.equipment_category.url); 
        if (collectionName) {
            const data = await fetch5eData(ruleset, collectionName);
            const categoryObj = data.find(c => c.index === catIndex);
            if (categoryObj && categoryObj.equipment) {
                resolvedOptions = categoryObj.equipment.map(item => ({ label: item.name, value: item.index, data: item }));
            }
        }
    }
    
    // Generate a unique ID so Zustand knows exactly which choice to resolve later
    return {
        id: `choice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        choose,
        type,
        desc: desc || `Choose ${choose}`,
        options: resolvedOptions,
        selections: [] // The UI will mutate this array up to the `choose` limit
    };
};
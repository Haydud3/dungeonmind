const fs = require('fs');

function replaceFile(path, replacer) {
    if (!fs.existsSync(path)) return;
    let content = fs.readFileSync(path, 'utf8');
    content = replacer(content);
    fs.writeFileSync(path, content);
    console.log("Patched", path);
}

replaceFile('src/components/NpcView.jsx', (file) => {
    file = file.replace(/alert\(`Success! Imported \$\{charData\.name\}`\);/g, 'toast(`Success! Imported ${charData.name}`, "success");');
    file = file.replace(/alert\("Import Failed: " \+ err\.message\);/g, 'toast("Import Failed: " + err.message, "error");');
    
    // Line 622: `if(!confirm("Delete this NPC?")) return;`
    // Ensure `const handleDeleteNpc = (npcId) => {` is async
    file = file.replace(/const handleDeleteNpc = \(npcId\) => \{/, 'const handleDeleteNpc = async (npcId) => {');
    file = file.replace(/if\(!confirm\("Delete this NPC\?"\)\) return;/g, 'if(!(await dialog.confirm("Delete this NPC?"))) return;');

    file = file.replace(/alert\("Copied to clipboard!"\);/g, 'toast("Copied to clipboard!", "success");');
    return file;
});

replaceFile('src/components/SideSheet.jsx', (file) => {
    if (!file.includes('useToast')) {
        file = file.replace(/import Icon from '\.\/Icon';/, "import Icon from './Icon';\nimport { useToast } from './ToastProvider';\nimport { useDialog } from './DialogProvider';");
    }
    if (!file.includes('const toast = useToast();')) {
        file = file.replace(/(const \{ user, campaign, updateCampaign \} = useNewCampaign\(\);)/, "$1\n    const toast = useToast();\n    const dialog = useDialog();");
    }
    file = file.replace(/alert\(mode === 'combine' \? `Combined updates for \$\{cleanChar\.name\}` : `Overwrote \$\{cleanChar\.name\} with fresh D&D Beyond data\.`\);/g, 'toast(mode === "combine" ? `Combined updates for ${cleanChar.name}` : `Overwrote ${cleanChar.name} with fresh D&D Beyond data.`, "success");');
    file = file.replace(/\} catch\(err\) \{ alert\("Refresh failed: " \+ err\.message\); \}/g, '} catch(err) { toast("Refresh failed: " + err.message, "error"); }');
    return file;
});

replaceFile('src/components/ui/CombatTrackerSidebar.jsx', (file) => {
    file = file.replace(/alert\(`\$\{actor\.name\} is already in combat\.`\);/g, 'toast(`${actor.name} is already in combat.`, "info");');
    return file;
});

replaceFile('src/components/SessionView.jsx', (file) => {
    if (!file.includes('useToast')) {
        file = file.replace(/import Icon from '\.\/Icon';/, "import Icon from './Icon';\nimport { useToast } from './ToastProvider';\nimport { useDialog } from './DialogProvider';");
    }
    if (!file.includes('const toast = useToast();')) {
        file = file.replace(/(const \{ user, gameParams, campaign, dmIds, sendMessage, chatLog, updateCampaign, getActiveMap, activeUsers \} = useNewCampaign\(\);)/, "$1\n    const toast = useToast();\n    const dialog = useDialog();");
    }

    file = file.replace(/alert\("Failed to upload image\."\);/g, 'toast("Failed to upload image.", "error");');
    file = file.replace(/return alert\("No target selected!"\);/g, 'return toast("No target selected!", "warning");');
    file = file.replace(/alert\(`Applied \$\{amount\} damage:\\n\$\{alertText\.join\('\\\\n'\)\}`\);/g, 'toast(`Applied ${amount} damage`, "success");');
    file = file.replace(/alert\("Selected tokens don't have HP tracking enabled\."\);/g, 'toast("Selected tokens do not have HP tracking enabled.", "warning");');
    file = file.replace(/alert\("Failed to apply damage\. See console\."\);/g, 'toast("Failed to apply damage. See console.", "error");');
    file = file.replace(/alert\("No active map found\."\);/g, 'toast("No active map found.", "error");');
    file = file.replace(/return alert\("Select tokens on the map to roll their saves\."\);/g, 'return toast("Select tokens on the map to roll their saves.", "warning");');
    file = file.replace(/return alert\("No character selected or assigned to roll the save\."\);/g, 'return toast("No character selected or assigned to roll the save.", "warning");');
    file = file.replace(/return alert\("Select a player\."\);/g, 'return toast("Select a player.", "warning");');
    
    return file;
});

replaceFile('src/components/ai-wizard/CharacterCreator.jsx', (file) => {
    if (!file.includes('useToast')) {
        file = file.replace(/import Icon from '\.\.\/Icon';/, "import Icon from '../Icon';\nimport { useToast } from '../ToastProvider';\nimport { useDialog } from '../DialogProvider';");
    }
    if (!file.includes('const toast = useToast();')) {
        file = file.replace(/(const \{ user \} = useNewCampaign\(\);)/, "$1\n    const toast = useToast();\n    const dialog = useDialog();");
    }
    
    file = file.replace(/else alert\("No results\."\);/g, 'else toast("No results.", "warning");');
    file = file.replace(/\} catch \(e\) \{ alert\("Search Error"\); \}/g, '} catch (e) { toast("Search Error", "error"); }');
    file = file.replace(/\} else \{ alert\("No API Key configured\."\); \}/g, '} else { toast("No API Key configured.", "error"); }');
    file = file.replace(/alert\("AI Helper not ready\. Please refresh\."\);/g, 'toast("AI Helper not ready. Please refresh.", "error");');
    file = file.replace(/alert\("Forge failed\. Error: " \+ e\.message\);/g, 'toast("Forge failed. Error: " + e.message, "error");');

    return file;
});

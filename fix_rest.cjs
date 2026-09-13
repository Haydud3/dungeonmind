const fs = require('fs');

function replaceFile(path, replacer) {
    let content = fs.readFileSync(path, 'utf8');
    content = replacer(content);
    fs.writeFileSync(path, content);
    console.log("Patched", path);
}

replaceFile('src/components/NpcView.jsx', (file) => {
    if (!file.includes('useToast')) {
        file = file.replace(/import \{ db, appId \} from '\.\.\/firebase';/, "import { db, appId } from '../firebase';\nimport { useToast } from './ToastProvider';\nimport { useDialog } from './DialogProvider';");
    }
    if (!file.includes('const toast = useToast();')) {
        file = file.replace(/(const \[filterNpcs, setFilterNpcs\] = useState\('all'\);)/, "$1\n    const toast = useToast();\n    const dialog = useDialog();");
    }

    file = file.replace(/alert\("The Forge failed\."\);/g, 'toast("The Forge failed.", "error");');
    file = file.replace(/alert\("Failed to parse the AI response into a valid NPC\. Check the text format\."\);/g, 'toast("Failed to parse the AI response into a valid NPC. Check the text format.", "error");');
    file = file.replace(/alert\("AI request failed\."\);/g, 'toast("AI request failed.", "error");');
    file = file.replace(/alert\("No monsters found in the SRD with that name\."\);/g, 'toast("No monsters found in the SRD with that name.", "error");');
    file = file.replace(/alert\("Could not connect to D&D 5e API\."\);/g, 'toast("Could not connect to D&D 5e API.", "error");');
    file = file.replace(/alert\("Failed to import monster details\. Check console\."\);/g, 'toast("Failed to import monster details. Check console.", "error");');
    file = file.replace(/alert\("No image available to forge a 3D mini\."\);/g, 'toast("No image available to forge a 3D mini.", "error");');
    file = file.replace(/alert\("3D Forge Failed: " \+ e\.message\);/g, 'toast("3D Forge Failed: " + e.message, "error");');
    file = file.replace(/alert\(`Successfully summoned \$\{finalNpc\.name\}!`\);/g, 'toast(`Successfully summoned ${finalNpc.name}!`, "success");');
    file = file.replace(/alert\(`Updated 3D model for \$\{finalNpc\.name\}!`\);/g, 'toast(`Updated 3D model for ${finalNpc.name}!`, "success");');
    file = file.replace(/if \(!confirm\(`Permanently delete \$\{npc\.name\}\?`\)\) return;/g, 'if (!(await dialog.confirm(`Permanently delete ${npc.name}?`))) return;');
    file = file.replace(/const deleteNpc = \(npc\) => \{/, 'const deleteNpc = async (npc) => {');

    return file;
});

replaceFile('src/components/PartyView.jsx', (file) => {
    if (!file.includes('useToast')) {
        file = file.replace(/import Icon from '\.\/Icon';/, "import Icon from './Icon';\nimport { useToast } from './ToastProvider';\nimport { useDialog } from './DialogProvider';");
    }
    if (!file.includes('const toast = useToast();')) {
        file = file.replace(/(const \[viewMode, setViewMode\] = useState\('list'\);)/, "$1\n    const toast = useToast();\n    const dialog = useDialog();");
    }

    file = file.replace(/alert\(`Combined updates for \$\{cleanChar\.name\}`\);/g, 'toast(`Combined updates for ${cleanChar.name}`, "success");');
    file = file.replace(/alert\(`Overwrote \$\{cleanChar\.name\} with fresh D&D Beyond data\.`\);/g, 'toast(`Overwrote ${cleanChar.name} with fresh D&D Beyond data.`, "success");');
    file = file.replace(/alert\("Refresh failed: " \+ err\.message\);/g, 'toast("Refresh failed: " + err.message, "error");');
    file = file.replace(/alert\(`Updated existing hero: \$\{cleanChar\.name\}`\);/g, 'toast(`Updated existing hero: ${cleanChar.name}`, "success");');
    file = file.replace(/alert\("Character saved to your personal Hub!"\);/g, 'toast("Character saved to your personal Hub!", "success");');
    file = file.replace(/alert\("Failed to save to Hub: " \+ e\.message\);/g, 'toast("Failed to save to Hub: " + e.message, "error");');
    file = file.replace(/alert\("Failed to setup save to Hub: " \+ e\.message\);/g, 'toast("Failed to setup save to Hub: " + e.message, "error");');
    file = file.replace(/alert\("You cannot peer into the soul of another adventurer\."\);/g, 'dialog.alert("You cannot peer into the soul of another adventurer.");');
    file = file.replace(/alert\("Import Failed: " \+ err\.message\);/g, 'toast("Import Failed: " + err.message, "error");');
    file = file.replace(/alert\("No image available to forge a 3D mini\."\);/g, 'toast("No image available to forge a 3D mini.", "error");');
    file = file.replace(/alert\("3D Forge Failed: " \+ e\.message\);/g, 'toast("3D Forge Failed: " + e.message, "error");');
    file = file.replace(/alert\(`Updated 3D model for \$\{finalChar\.name\}!`\);/g, 'toast(`Updated 3D model for ${finalChar.name}!`, "success");');

    file = file.replace(/const deleteChar = \(char\) => \{/, 'const deleteChar = async (char) => {');
    file = file.replace(/if \(!confirm\("Delete this hero permanently\?"\)\) return;/g, 'if (!(await dialog.confirm("Delete this hero permanently?"))) return;');

    return file;
});

replaceFile('src/components/WorldCreator.jsx', (file) => {
    if (!file.includes('useToast')) {
        file = file.replace(/import Icon from '\.\/Icon';/, "import Icon from './Icon';\nimport { useToast } from './ToastProvider';\nimport { useDialog } from './DialogProvider';");
    }
    if (!file.includes('const toast = useToast();')) {
        file = file.replace(/(const \[showAddLocationModal, setShowAddLocationModal\] = useState\(false\);)/, "$1\n    const toast = useToast();\n    const dialog = useDialog();");
    }

    file = file.replace(/const handleDestroyLocation = \(loc\) => \{/, 'const handleDestroyLocation = async (loc) => {');
    file = file.replace(/if \(confirm\("Destroy this location\?"\)\) \{/, 'if (await dialog.confirm("Destroy this location?")) {');
    return file;
});

replaceFile('src/components/MapSourcingModal.jsx', (file) => {
    if (!file.includes('useToast')) {
        file = file.replace(/import Icon from '\.\/Icon';/, "import Icon from './Icon';\nimport { useToast } from './ToastProvider';\nimport { useDialog } from './DialogProvider';");
    }
    if (!file.includes('const toast = useToast();')) {
        file = file.replace(/(const \{ user, campaignCode \} = useNewCampaign\(\);)/, "$1\n    const toast = useToast();\n    const dialog = useDialog();");
    }

    file = file.replace(/alert\("Failed to find maps\. CORS or network error\."\);/g, 'toast("Failed to find maps. CORS or network error.", "error");');
    file = file.replace(/if \(!campaignCode\) return alert\("Missing campaign code\."\);/g, 'if (!campaignCode) return toast("Missing campaign code.", "error");');
    file = file.replace(/alert\(`Map "\$\{sourcingMap\.name\}" imported successfully!\\n\\nTokens and Lore Pins have been placed\. Remember to open the Tactical Map and use the \[Detect Grid Size\] and \[Architect Mask\] tools to automatically align the map and generate walls!`\);/g, 'dialog.alert(`Map "${sourcingMap.name}" imported successfully!\\n\\nTokens and Lore Pins have been placed. Remember to open the Tactical Map and use the [Detect Grid Size] and [Architect Mask] tools to automatically align the map and generate walls!`);');
    file = file.replace(/alert\("Failed to process and save map\."\);/g, 'toast("Failed to process and save map.", "error");');
    return file;
});

replaceFile('src/components/JournalPageEditor.jsx', (file) => {
    if (!file.includes('useToast')) {
        file = file.replace(/import \{ updateDoc \} from 'firebase\/firestore';/, "import { updateDoc } from 'firebase/firestore';\nimport { useDialog } from './DialogProvider';\nimport { useToast } from './ToastProvider';");
    }
    if (!file.includes('const dialog = useDialog();')) {
        file = file.replace(/(const \[content, setContent\] = useState\(initialContent\);)/, "$1\n    const dialog = useDialog();\n    const toast = useToast();");
    }

    // Insert Table Prompt (line 321/322 approx)
    file = file.replace(/const handleInsertTable = \(\) => \{/, 'const handleInsertTable = async () => {');
    file = file.replace(/const rows = prompt\("How many rows\?", "3"\);/, 'const rows = await dialog.prompt("How many rows?", "3");');
    file = file.replace(/const cols = prompt\("How many columns\?", "3"\);/, 'const cols = await dialog.prompt("How many columns?", "3");');

    // Resize Image Prompt (line 404 approx)
    file = file.replace(/const handleResizeImage = \(\) => \{/, 'const handleResizeImage = async () => {');
    file = file.replace(/const newWidth = prompt\("Enter new width \(e\.g\., '50%', '300px'\):", currentWidth\);/, 'const newWidth = await dialog.prompt("Enter new width (e.g., \'50%\', \'300px\'):", currentWidth);');

    return file;
});


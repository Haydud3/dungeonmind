const fs = require('fs');

function replaceFile(path, replacer) {
    let content = fs.readFileSync(path, 'utf8');
    content = replacer(content);
    fs.writeFileSync(path, content);
    console.log("Patched", path);
}

replaceFile('src/components/HandoutEditor.jsx', (file) => {
    if (!file.includes('useDialog')) {
        file = file.replace(/import Icon from '\.\/Icon';/, "import Icon from './Icon';\nimport { useDialog } from './DialogProvider';");
    }
    if (!file.includes('const dialog = useDialog();')) {
        file = file.replace(/(const \[activeHandoutBlocks, setActiveHandoutBlocks\] = useState\(\[\]\);)/, "$1\n    const dialog = useDialog();");
    }
    file = file.replace(/const newWidth = prompt\("Enter new width \(e\.g\., '50%', '300px'\):", currentWidth\);/, 'const newWidth = await dialog.prompt("Enter new width (e.g., \'50%\', \'300px\'):", currentWidth);');
    file = file.replace(/const resizeImage = \(id, currentWidth\) => \{/, 'const resizeImage = async (id, currentWidth) => {');
    return file;
});

replaceFile('src/components/TacticalMapView.jsx', (file) => {
    if (!file.includes('useDialog')) {
        file = file.replace(/import Icon from '\.\/Icon';/, "import Icon from './Icon';\nimport { useDialog } from './DialogProvider';");
    }
    if (!file.includes('const dialog = useDialog();')) {
        file = file.replace(/(const \{ campaign, updateCampaign, user, sendMessage \} = useNewCampaign\(\);)/, "$1\n    const dialog = useDialog();");
    }
    file = file.replace(/const overwrite = window\.confirm\(`Some of the selected characters are already in the initiative tracker\. Do you want to overwrite their existing initiatives\? \(Click 'Cancel' to only roll for new characters\)`\);/, 'const overwrite = await dialog.confirm(`Some of the selected characters are already in the initiative tracker. Do you want to overwrite their existing initiatives? (Click \'Cancel\' to only roll for new characters)`);');
    file = file.replace(/const rollGroupInitiative = \(tokenIds\) => \{/, 'const rollGroupInitiative = async (tokenIds) => {');
    return file;
});

replaceFile('src/contexts/NewCampaignProvider.jsx', (file) => {
    if (!file.includes('useDialog')) {
        file = file.replace(/import React, \{ createContext, useContext, useState, useEffect \} from 'react';/, "import React, { createContext, useContext, useState, useEffect } from 'react';\nimport { useDialog } from '../components/DialogProvider';");
    }
    if (!file.includes('const dialog = useDialog();')) {
        file = file.replace(/(const \[gameParams, setGameParams\] = useState\(null\);)/, "$1\n    const dialog = useDialog();");
    }
    file = file.replace(/alert\("Database Error: Check your Firestore Rules in the Firebase Console!"\);/g, 'dialog.alert("Database Error: Check your Firestore Rules in the Firebase Console!");');
    file = file.replace(/if \(!confirm\("Delete all chat history\?"\)\) return;/g, 'if (!(await dialog.confirm("Delete all chat history?"))) return;');
    file = file.replace(/const clearChat = \(\) => \{/, 'const clearChat = async () => {');
    file = file.replace(/alert\("Failed to save to cloud\. Check console\."\);/g, 'dialog.alert("Failed to save to cloud. Check console.");');
    return file;
});

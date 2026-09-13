const fs = require('fs');
let file = fs.readFileSync('src/components/SettingsView.jsx', 'utf8');

// Add imports
if (!file.includes('useDialog')) {
    file = file.replace(/import Icon from '\.\/Icon';/, "import Icon from './Icon';\nimport { useToast } from './ToastProvider';\nimport { useDialog } from './DialogProvider';");
}

// Add hooks
if (!file.includes('const toast = useToast();')) {
    file = file.replace(/(const data = campaign; \/\/ for compatibility)/, "$1\n    const toast = useToast();\n    const dialog = useDialog();");
}

// Replace alert("...") with toast("...", "success" or "error") or dialog.alert depending on context
file = file.replace(/alert\("Profile updated successfully!"\);/g, 'toast("Profile updated successfully!", "success");');
file = file.replace(/alert\("Failed to update profile."\);/g, 'toast("Failed to update profile.", "error");');
file = file.replace(/alert\("Character Integration Updated!"\);/g, 'toast("Character Integration Updated!", "success");');
file = file.replace(/alert\("Please enter a valid email address."\);/g, 'toast("Please enter a valid email address.", "error");');
file = file.replace(/alert\(`Invite sent to \$\{cleanEmail\}!`\);/g, 'toast(`Invite sent to ${cleanEmail}!`, "success");');
file = file.replace(/alert\("Failed to send invite\. " \+ err\.message\);/g, 'toast("Failed to send invite. " + err.message, "error");');
file = file.replace(/alert\("Campaign Bible Updated!"\);/g, 'toast("Campaign Bible Updated!", "success");');
file = file.replace(/alert\("Cannot renounce: You are the only DM left!"\);/g, 'dialog.alert("Cannot renounce: You are the only DM left!");');
file = file.replace(/alert\("Invite link copied to clipboard!"\);/g, 'toast("Invite link copied to clipboard!", "success");');

// Fix toggleDmStatus to be async
file = file.replace(/const toggleDmStatus = \(uid\) => \{/, 'const toggleDmStatus = async (uid) => {');
// Fix confirms
file = file.replace(/if \(!confirm\(`Revoke invite for \$\{email\}\?`\)\) return;/g, 'if (!(await dialog.confirm(`Revoke invite for ${email}?`))) return;');
file = file.replace(/if \(!confirm\("Are you sure you want to renounce your Dungeon Master status\? You will lose access to DM tools immediately\."\)\) return;/g, 'if (!(await dialog.confirm("Are you sure you want to renounce your Dungeon Master status? You will lose access to DM tools immediately."))) return;');
file = file.replace(/if \(!confirm\("Promote this user to Dungeon Master\? They will have full control over the campaign settings\."\)\) return;/g, 'if (!(await dialog.confirm("Promote this user to Dungeon Master? They will have full control over the campaign settings."))) return;');

// Fix handleSafeExit to be async
file = file.replace(/const handleSafeExit = \(\) => \{/, 'const handleSafeExit = async () => {');
file = file.replace(/if \(window\.confirm\("Disconnect from session\?"\)\) \{/, 'if (await dialog.confirm("Disconnect from session?")) {');

// Fix invalidate link
file = file.replace(/if\(window\.confirm\("Invalidate the old invite link and generate a new one\?"\)\) \{/, 'if(await dialog.confirm("Invalidate the old invite link and generate a new one?")) {');

// Fix handleRevokeInvite to be async (already is)
// const handleRevokeInvite = async (email) => { ... } is already async.

fs.writeFileSync('src/components/SettingsView.jsx', file);
console.log("SettingsView patched.");

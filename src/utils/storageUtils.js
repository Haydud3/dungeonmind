import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Upload a Blob/File to Firebase Storage and return the public URL
export const uploadImage = async (blob, path) => {
    if (!storage) throw new Error("Firebase Storage not initialized");
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
};

// Convert an <img> element (from Puter.js) to a Blob for uploading
export const imageElementToBlob = async (imgElement) => {
    return new Promise((resolve, reject) => {
        // If it's already a blob URL (Puter often returns these), fetch it
        if (imgElement.src.startsWith('blob:')) {
            fetch(imgElement.src)
                .then(r => r.blob())
                .then(resolve)
                .catch(reject);
        } else {
            // Fallback: Draw to canvas to sanitize/convert
            const canvas = document.createElement('canvas');
            canvas.width = imgElement.naturalWidth || 2048; // Increased from 1024
            canvas.height = imgElement.naturalHeight || 2048; 
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(resolve, 'image/jpeg', 0.85);
        }
    });
};
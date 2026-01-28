import { db, storage } from '../firebase';
import { collection, addDoc, doc, setDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
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
            canvas.width = imgElement.naturalWidth || 2048;
            canvas.height = imgElement.naturalHeight || 2048; 
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(resolve, 'image/jpeg', 0.85);
        }
    });
};

// Phase 1: Store Base64 in chunks to bypass document size limits
export const storeChunkedMap = async (base64, name) => {
    const CHUNK_SIZE = 900000;
    const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);
    
    const metaRef = await addDoc(collection(db, "map_metadata"), {
        name,
        totalChunks,
        createdAt: serverTimestamp()
    });

    for (let i = 0; i < totalChunks; i++) {
        const chunk = base64.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await setDoc(doc(db, "map_metadata", metaRef.id, "chunks", i.toString()), {
            data: chunk,
            index: i
        });
    }

    return `chunked:${metaRef.id}`;
};

// Phase 2: Retrieve and assemble chunks into a single Base64 string
export const retrieveChunkedMap = async (chunkedId) => {
    const docId = chunkedId.replace('chunked:', '');
    const chunksRef = collection(db, "map_metadata", docId, "chunks");
    const q = query(chunksRef, orderBy("index", "asc"));
    const snapshot = await getDocs(q);
    
    let fullBase64 = "";
    snapshot.forEach(doc => {
        fullBase64 += doc.data().data;
    });
    return fullBase64;
};
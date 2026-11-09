const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../database/db');
const { requireAdmin } = require('../middleware/session-auth');

const router = express.Router();
const uploadDirectory = path.resolve(__dirname, '../../public/uploads');
const imageTypes = new Map([
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.png', 'image/png'],
    ['.webp', 'image/webp']
]);
const pricePattern = /^\d+(?:\.\d{1,2})?$/;
const upload = multer({
    storage: multer.diskStorage({
        destination(req, file, callback) {
            fs.mkdir(uploadDirectory, { recursive: true }, (error) => callback(error, uploadDirectory));
        },
        filename(req, file, callback) {
            callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter(req, file, callback) {
        const extension = path.extname(file.originalname).toLowerCase();
        if (imageTypes.get(extension) !== file.mimetype) {
            callback(new Error('Choose a JPG, JPEG, PNG, or WEBP image.'));
            return;
        }
        callback(null, true);
    }
});

function handleImageUpload(req, res, next) {
    upload.single('watch_image')(req, res, (error) => {
        if (!error) {
            next();
            return;
        }
        const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
            ? 'The image must be 5 MB or smaller.'
            : error instanceof multer.MulterError
                ? 'Choose one image up to 5 MB.'
                : error.message;
        res.status(400).json({ success: false, message });
    });
}

async function removeFile(filePath) {
    try {
        await fs.promises.unlink(filePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
}

async function discardUpload(file) {
    if (!file) return;
    try {
        await removeFile(file.path);
    } catch (error) {
        console.error('Could not remove an unsaved watch image:', error);
    }
}

async function hasValidImageSignature(file) {
    const contents = await fs.promises.readFile(file.path);
    const extension = path.extname(file.originalname).toLowerCase();
    if (extension === '.jpg' || extension === '.jpeg') {
        return contents.length >= 3 && contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff;
    }
    if (extension === '.png') {
        return contents.length >= 8 && contents.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    return contents.length >= 12
        && contents.toString('ascii', 0, 4) === 'RIFF'
        && contents.toString('ascii', 8, 12) === 'WEBP';
}

async function removeStoredImage(imagePath) {
    const match = /^\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp))$/i.exec(imagePath);
    if (!match) throw new Error('The saved image path is invalid.');
    await removeFile(path.join(uploadDirectory, match[1]));
}

function parseWatch(body, current = null) {
    const text = (field, fallback) => typeof body[field] === 'string'
        ? body[field].trim()
        : fallback;
    const name = text('name', current ? current.name : '');
    const brand = text('brand', current ? current.brand : '');
    const description = text('description', current ? current.description : '');
    const colour = text('colour', current ? current.colour : '');
    const rawPrice = body.price === undefined && current ? String(current.price) : String(body.price || '').trim();
    const price = pricePattern.test(rawPrice) ? Number(rawPrice) : NaN;
    const availability = text('availability', current ? current.availability : 'Available');

    if (!name || name.length > 120 || !brand || brand.length > 80) {
        return { error: 'Enter a watch name (up to 120 characters) and brand (up to 80 characters).' };
    }
    if (!Number.isFinite(price) || price <= 0) {
        return { error: 'Enter a valid price greater than ₦0.' };
    }
    if (!description || description.length > 2000 || !colour || colour.length > 60) {
        return { error: 'Enter a description (up to 2,000 characters) and colour (up to 60 characters).' };
    }
    if (!['Available', 'Sold out'].includes(availability)) {
        return { error: 'Choose a valid availability status.' };
    }
    return { watch: { name, brand, price, description, colour, availability } };
}

function parseId(value) {
    return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

async function validateUpload(req, res) {
    if (!req.file) return true;
    try {
        if (await hasValidImageSignature(req.file)) return true;
    } catch (error) {
        await discardUpload(req.file);
        console.error('Could not validate watch image:', error);
        res.status(500).json({ success: false, message: 'Could not validate the selected image.' });
        return false;
    }
    await discardUpload(req.file);
    res.status(400).json({ success: false, message: 'The selected file is not a valid JPG, JPEG, PNG, or WEBP image.' });
    return false;
}

router.get('/watches', async (req, res) => {
    try {
        const watches = await db.all('SELECT * FROM watches ORDER BY id DESC');
        res.json({ success: true, watches });
    } catch (error) {
        console.error('Error retrieving watches:', error);
        res.status(500).json({ success: false, message: 'Could not load watches. Please try again.' });
    }
});

router.get('/watches/:id', async (req, res) => {
    const watchId = parseId(req.params.id);
    if (!watchId) return res.status(400).json({ success: false, message: 'Choose a valid watch.' });
    try {
        const watch = await db.get('SELECT * FROM watches WHERE id = ?', [watchId]);
        if (!watch) return res.status(404).json({ success: false, message: 'That watch could not be found.' });
        res.json({ success: true, watch });
    } catch (error) {
        console.error('Error retrieving watch:', error);
        res.status(500).json({ success: false, message: 'Could not load this watch. Please try again.' });
    }
});

router.post('/watches', requireAdmin, handleImageUpload, async (req, res) => {
    if (!(await validateUpload(req, res))) return;
    const parsed = parseWatch(req.body || {});
    if (parsed.error) {
        await discardUpload(req.file);
        return res.status(400).json({ success: false, message: parsed.error });
    }
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
    try {
        const { name, brand, price, description, colour, availability } = parsed.watch;
        const result = await db.run(
            'INSERT INTO watches (name, brand, price, description, colour, availability, image_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, brand, price, description, colour, availability, imagePath]
        );
        const watch = await db.get('SELECT * FROM watches WHERE id = ?', [result.lastID]);
        res.status(201).json({ success: true, message: 'Watch added to the collection.', watch });
    } catch (error) {
        await discardUpload(req.file);
        console.error('Error creating watch:', error);
        res.status(500).json({ success: false, message: 'Could not save this watch. Please try again.' });
    }
});

router.put('/watches/:id', requireAdmin, handleImageUpload, async (req, res) => {
    const watchId = parseId(req.params.id);
    if (!watchId) {
        await discardUpload(req.file);
        return res.status(400).json({ success: false, message: 'Choose a valid watch.' });
    }
    if (!(await validateUpload(req, res))) return;
    try {
        const current = await db.get('SELECT * FROM watches WHERE id = ?', [watchId]);
        if (!current) {
            await discardUpload(req.file);
            return res.status(404).json({ success: false, message: 'That watch could not be found.' });
        }
        const parsed = parseWatch(req.body || {}, current);
        if (parsed.error) {
            await discardUpload(req.file);
            return res.status(400).json({ success: false, message: parsed.error });
        }
        const imagePath = req.file ? `/uploads/${req.file.filename}` : current.image_path;
        const { name, brand, price, description, colour, availability } = parsed.watch;
        await db.run(
            `UPDATE watches SET name = ?, brand = ?, price = ?, description = ?, colour = ?,
             availability = ?, image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [name, brand, price, description, colour, availability, imagePath, watchId]
        );
        const watch = await db.get('SELECT * FROM watches WHERE id = ?', [watchId]);
        let message = 'Watch updated.';
        if (req.file && current.image_path) {
            try {
                await removeStoredImage(current.image_path);
            } catch (error) {
                console.error('Could not remove the replaced watch image:', error);
                message = 'Watch updated, but its previous image could not be removed.';
            }
        }
        res.json({ success: true, message, watch });
    } catch (error) {
        await discardUpload(req.file);
        console.error('Error updating watch:', error);
        res.status(500).json({ success: false, message: 'Could not update this watch. Please try again.' });
    }
});

router.delete('/watches/:id', requireAdmin, async (req, res) => {
    const watchId = parseId(req.params.id);
    if (!watchId) return res.status(400).json({ success: false, message: 'Choose a valid watch.' });
    try {
        const watch = await db.get('SELECT image_path FROM watches WHERE id = ?', [watchId]);
        if (!watch) return res.status(404).json({ success: false, message: 'That watch could not be found.' });
        await db.run('DELETE FROM watches WHERE id = ?', [watchId]);
        let message = 'Watch removed from the collection.';
        if (watch.image_path) {
            try {
                await removeStoredImage(watch.image_path);
            } catch (error) {
                console.error('Could not remove the deleted watch image:', error);
                message = 'Watch deleted, but its image could not be removed.';
            }
        }
        res.json({ success: true, message, watchId });
    } catch (error) {
        console.error('Error deleting watch:', error);
        res.status(500).json({ success: false, message: 'Could not delete this watch. Please try again.' });
    }
});

module.exports = router;
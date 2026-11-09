document.addEventListener('DOMContentLoaded', async () => {
    const list = document.getElementById('watch-list');
    const count = document.getElementById('watch-count');
    const availableCount = document.getElementById('available-count');
    const message = document.getElementById('dashboard-message');
    const dialog = document.getElementById('watch-dialog');
    const form = document.getElementById('watch-form');
    const formMessage = document.getElementById('watch-form-message');
    const saveButton = document.getElementById('save-watch');
    const priceFormatter = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
    const fallbackImage = 'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=700&q=80';
    let editingId = null;

    function setMessage(text, isError = false, target = message) {
        target.textContent = text;
        target.classList.toggle('is-error', isError);
    }

    function makeElement(tag, className, text) {
        const element = document.createElement(tag);
        element.className = className;
        element.textContent = text;
        return element;
    }

    function makeCard(watch) {
        const item = document.createElement('article');
        item.className = 'admin-watch-row';
        item.dataset.watchId = String(watch.id);
        const image = document.createElement('img');
        image.className = 'admin-watch-thumb';
        image.src = watch.image_path || fallbackImage;
        image.alt = '';
        const info = document.createElement('div');
        info.className = 'admin-watch-info';
        info.append(
            makeElement('p', 'product-brand', watch.brand),
            makeElement('h3', 'admin-watch-name', watch.name),
            makeElement('p', 'admin-watch-meta', `${watch.colour} · ${priceFormatter.format(watch.price)}`)
        );
        const status = makeElement('span', `admin-status${watch.availability === 'Sold out' ? ' is-sold-out' : ''}`, watch.availability);
        const actions = document.createElement('div');
        actions.className = 'admin-watch-actions';
        const editButton = makeElement('button', 'icon-action', 'Edit');
        editButton.type = 'button';
        editButton.dataset.action = 'edit';
        const deleteButton = makeElement('button', 'icon-action is-danger', 'Delete');
        deleteButton.type = 'button';
        deleteButton.dataset.action = 'delete';
        actions.append(editButton, deleteButton);
        item.append(image, info, status, actions);
        return item;
    }

    function render(watches) {
        list.replaceChildren(...watches.map(makeCard));
        list.setAttribute('aria-busy', 'false');
        count.textContent = String(watches.length).padStart(2, '0');
        availableCount.textContent = String(watches.filter((watch) => watch.availability === 'Available').length).padStart(2, '0');
        if (!watches.length) list.append(makeElement('p', 'empty-products', 'Your collection is ready for its first timepiece.'));
    }

    async function loadWatches() {
        list.setAttribute('aria-busy', 'true');
        try {
            const response = await fetch('/api/watches');
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || 'Could not load watches.');
            render(result.watches);
        } catch (error) {
            list.setAttribute('aria-busy', 'false');
            setMessage(error.message || 'Could not connect to the server.', true);
        }
    }

    function openDialog(watch = null) {
        editingId = watch ? watch.id : null;
        form.reset();
        formMessage.textContent = '';
        document.getElementById('watch-dialog-title').textContent = watch ? 'Edit watch' : 'Add a watch';
        saveButton.textContent = watch ? 'Save changes' : 'Save watch';
        if (watch) {
            for (const field of ['name', 'brand', 'price', 'description', 'colour', 'availability']) {
                form.elements[field].value = watch[field];
            }
        }
        dialog.showModal();
        form.elements.name.focus();
    }

    async function checkAdmin() {
        try {
            const response = await fetch('/api/me');
            if (response.status === 401) {
                window.location.replace('/login.html');
                return false;
            }
            const result = await response.json();
            if (!response.ok || !result.success || !result.user.isAdmin) {
                window.location.replace('/');
                return false;
            }
            return true;
        } catch (error) {
            setMessage('Could not verify administrator access. Refresh and try again.', true);
            return false;
        }
    }

    document.getElementById('open-watch-dialog').addEventListener('click', () => openDialog());
    document.getElementById('close-watch-dialog').addEventListener('click', () => dialog.close());
    document.getElementById('cancel-watch').addEventListener('click', () => dialog.close());

    document.getElementById('watch-image').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const extensions = new Map([
            ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp']
        ]);
        const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (extensions.get(extension) !== file.type || file.size > 5 * 1024 * 1024) {
            event.target.value = '';
            setMessage(file.size > 5 * 1024 * 1024 ? 'The image must be 5 MB or smaller.' : 'Choose a JPG, JPEG, PNG, or WEBP image.', true, formMessage);
        } else {
            formMessage.textContent = '';
        }
    });

    list.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const row = button.closest('[data-watch-id]');
        const watchId = row && row.dataset.watchId;
        if (!watchId) return;
        if (button.dataset.action === 'edit') {
            try {
                const response = await fetch(`/api/watches/${encodeURIComponent(watchId)}`);
                const result = await response.json();
                if (!response.ok || !result.success) throw new Error(result.message || 'Could not load this watch.');
                openDialog(result.watch);
            } catch (error) {
                setMessage(error.message, true);
            }
            return;
        }
        if (!window.confirm('Delete this watch from the collection?')) return;
        button.disabled = true;
        try {
            const response = await fetch(`/api/watches/${encodeURIComponent(watchId)}`, { method: 'DELETE' });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || 'Could not delete this watch.');
            setMessage(result.message);
            await loadWatches();
        } catch (error) {
            setMessage(error.message || 'Could not connect to the server.', true);
            button.disabled = false;
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        setMessage('', false, formMessage);
        setMessage('');
        saveButton.disabled = true;
        const url = editingId ? `/api/watches/${encodeURIComponent(editingId)}` : '/api/watches';
        try {
            const response = await fetch(url, {
                method: editingId ? 'PUT' : 'POST',
                body: new FormData(form)
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || 'Could not save this watch.');
            dialog.close();
            setMessage(result.message);
            await loadWatches();
        } catch (error) {
            setMessage(error.message || 'Could not connect to the server.', true, formMessage);
        } finally {
            saveButton.disabled = false;
        }
    });

    document.getElementById('logout-button').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/logout', { method: 'POST' });
            if (!response.ok) throw new Error('Could not sign out. Please try again.');
            window.location.replace('/');
        } catch (error) {
            setMessage(error.message, true);
        }
    });

    if (await checkAdmin()) await loadWatches();
});

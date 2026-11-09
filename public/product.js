document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('product-detail');
    const priceFormatter = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
    const imageSet = [
        'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=1400&q=88',
        'https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=crop&w=1400&q=88',
        'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=1400&q=88',
        'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=1400&q=88'
    ];

    function messageLink(watch, number) {
        const text = `Hello T:10 Watches, I'm interested in the ${watch.brand} ${watch.name} (${priceFormatter.format(watch.price)}).`;
        return number
            ? `https://wa.me/${encodeURIComponent(number)}?text=${encodeURIComponent(text)}`
            : `https://wa.me/2348147781361?text=${encodeURIComponent(text)}`;
    }

    try {
        const id = new URLSearchParams(window.location.search).get('id');
        if (!id || !/^[1-9]\d*$/.test(id)) throw new Error('This watch could not be found.');
        const [watchResponse, configResponse] = await Promise.all([
            fetch(`/api/watches/${encodeURIComponent(id)}`),
            fetch('/api/store-config')
        ]);
        const result = await watchResponse.json();
        const config = configResponse.ok ? await configResponse.json() : {};
        const whatsappNumber = (config.whatsappNumber || '2348147781361').replace(/\D/g, '');
        document.querySelectorAll('[data-whatsapp-contact]').forEach((link) => {
            link.href = `https://wa.me/${encodeURIComponent(whatsappNumber)}`;
        });
        if (!watchResponse.ok || !result.success) throw new Error(result.message || 'This watch could not be found.');
        const watch = result.watch;
        document.title = `${watch.name} | T:10 Watches`;

        const layout = document.createElement('section');
        layout.className = 'product-detail-layout';
        const imageWrap = document.createElement('div');
        imageWrap.className = 'product-detail-image';
        const image = document.createElement('img');
        image.src = watch.image_path || imageSet[Math.abs(Number(watch.id) - 1) % imageSet.length];
        image.alt = `${watch.brand} ${watch.name}`;
        imageWrap.append(image);

        const copy = document.createElement('div');
        copy.className = 'product-detail-copy';
        const breadcrumb = document.createElement('a');
        breadcrumb.className = 'eyebrow';
        breadcrumb.href = '/shop.html';
        breadcrumb.textContent = 'T:10 WATCHES / THE COLLECTION';
        const brand = document.createElement('p');
        brand.className = 'product-detail-brand';
        brand.textContent = watch.brand;
        const name = document.createElement('h1');
        name.textContent = watch.name;
        const price = document.createElement('p');
        price.className = 'product-detail-price';
        price.textContent = priceFormatter.format(watch.price);
        const description = document.createElement('p');
        description.className = 'product-description';
        description.textContent = watch.description;
        const specs = document.createElement('dl');
        specs.className = 'product-specs';
        for (const [label, value] of [['Colour', watch.colour], ['Availability', watch.availability]]) {
            const group = document.createElement('div');
            const term = document.createElement('dt');
            term.textContent = label;
            const detail = document.createElement('dd');
            detail.textContent = value;
            group.append(term, detail);
            specs.append(group);
        }
        const order = document.createElement('a');
        order.className = `button button-dark whatsapp-button${watch.availability === 'Sold out' ? ' is-disabled' : ''}`;
        order.href = messageLink(watch, whatsappNumber);
        order.target = '_blank';
        order.rel = 'noreferrer';
        order.textContent = watch.availability === 'Available' ? 'Order via WhatsApp' : 'Currently unavailable';
        if (watch.availability === 'Sold out') {
            order.setAttribute('aria-disabled', 'true');
            order.removeAttribute('href');
            order.removeAttribute('target');
        }
        const note = document.createElement('p');
        note.className = 'order-note';
        note.textContent = 'Questions about this piece? Message us and we will be glad to help.';
        copy.append(breadcrumb, brand, name, price, description, specs, order, note);
        layout.append(imageWrap, copy);
        container.replaceChildren(layout);
        container.setAttribute('aria-busy', 'false');
    } catch (error) {
        const message = document.createElement('p');
        message.className = 'empty-products product-error';
        message.textContent = error.message || 'Could not load this timepiece.';
        container.replaceChildren(message);
        container.setAttribute('aria-busy', 'false');
    }
});

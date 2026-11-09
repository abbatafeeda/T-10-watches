document.addEventListener('DOMContentLoaded', async () => {
    const priceFormatter = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
    const imageSet = [
        'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=1000&q=85',
        'https://images.unsplash.com/photo-1547996160-81dfa63595aa?auto=format&fit=crop&w=1000&q=85',
        'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=1000&q=85',
        'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=1000&q=85'
    ];
    const year = document.getElementById('current-year');
    if (year) year.textContent = String(new Date().getFullYear());

    function imageFor(watch) {
        return watch.image_path || imageSet[Math.abs(Number(watch.id) - 1) % imageSet.length];
    }

    function orderUrl(watch, number) {
        const text = `Hello T:10 Watches, I'd like to order ${watch.name} for ${priceFormatter.format(watch.price)}.`;
        return `https://wa.me/${encodeURIComponent(number)}?text=${encodeURIComponent(text)}`;
    }

    function makeCard(watch, whatsappNumber) {
        const article = document.createElement('article');
        article.className = 'product-card';
        const link = document.createElement('a');
        link.className = 'product-card-image';
        link.href = `/product.html?id=${encodeURIComponent(watch.id)}`;
        link.setAttribute('aria-label', `View ${watch.name}`);
        const image = document.createElement('img');
        image.src = imageFor(watch);
        image.alt = `${watch.brand} ${watch.name}`;
        image.loading = 'lazy';
        const status = document.createElement('span');
        status.className = `availability-tag${watch.availability === 'Sold out' ? ' is-sold-out' : ''}`;
        status.textContent = watch.availability;
        link.append(image, status);
        const details = document.createElement('div');
        details.className = 'product-card-info';
        const brand = document.createElement('p');
        brand.className = 'product-brand';
        brand.textContent = watch.brand;
        const name = document.createElement('h3');
        name.append(Object.assign(document.createElement('a'), {
            href: `/product.html?id=${encodeURIComponent(watch.id)}`,
            textContent: watch.name
        }));
        const price = document.createElement('p');
        price.className = 'product-price';
        price.textContent = priceFormatter.format(watch.price);
        const order = document.createElement(watch.availability === 'Available' ? 'a' : 'button');
        order.className = `product-order-link${watch.availability === 'Available' ? '' : ' is-unavailable'}`;
        order.textContent = watch.availability === 'Available' ? 'Order on WhatsApp' : 'Currently unavailable';
        if (watch.availability === 'Available') {
            order.href = orderUrl(watch, whatsappNumber);
            order.target = '_blank';
            order.rel = 'noreferrer';
        } else {
            order.disabled = true;
        }
        details.append(brand, name, price, order);
        article.append(link, details);
        return article;
    }

    async function loadWatches() {
        const featured = document.getElementById('featured-watches');
        const grid = document.getElementById('shop-watches');
        const count = document.getElementById('shop-count');
        const filter = document.getElementById('availability-filter');
        const target = grid || featured;
        if (!target) return;

        try {
            const [response, configResponse] = await Promise.all([
                fetch('/api/watches'),
                fetch('/api/store-config')
            ]);
            const result = await response.json();
            const config = configResponse.ok ? await configResponse.json() : {};
            const whatsappNumber = (config.whatsappNumber || '2348147781361').replace(/\D/g, '');
            document.querySelectorAll('[data-whatsapp-contact]').forEach((link) => {
                link.href = `https://wa.me/${encodeURIComponent(whatsappNumber)}`;
            });
            if (!response.ok || !result.success) throw new Error(result.message || 'The collection is unavailable.');
            const watches = result.watches || [];
            const render = () => {
                const filtered = grid && filter && filter.value !== 'all'
                    ? watches.filter((watch) => watch.availability === filter.value)
                    : watches;
                const visible = featured ? filtered.filter((watch) => watch.availability === 'Available').slice(0, 4) : filtered;
                target.replaceChildren(...visible.map((watch) => makeCard(watch, whatsappNumber)));
                target.setAttribute('aria-busy', 'false');
                if (count) count.textContent = `${filtered.length} ${filtered.length === 1 ? 'timepiece' : 'timepieces'}`;
                if (!visible.length) {
                    const empty = document.createElement('p');
                    empty.className = 'empty-products';
                    empty.textContent = 'There are no watches in this selection just yet.';
                    target.append(empty);
                }
            };
            if (filter) filter.addEventListener('change', render);
            render();
        } catch (error) {
            target.setAttribute('aria-busy', 'false');
            target.replaceChildren(Object.assign(document.createElement('p'), {
                className: 'empty-products',
                textContent: error.message || 'Could not load the collection.'
            }));
            if (count) count.textContent = 'Collection unavailable';
        }
    }

    loadWatches();
});

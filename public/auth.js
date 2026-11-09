document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    async function submitForm(form, messageElement, endpoint) {
        const button = form.querySelector('button[type="submit"]');
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        messageElement.textContent = '';
        messageElement.classList.remove('is-success');
        button.disabled = true;

        try {
            const response = await fetch(`/api/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                messageElement.textContent = result.message || 'Something went wrong. Please try again.';
                return null;
            }
            return result;
        } catch (error) {
            messageElement.textContent = 'Could not connect to the server. Please try again.';
            return null;
        } finally {
            button.disabled = false;
        }
    }

    if (loginForm) loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = document.getElementById('login-message');
        const result = await submitForm(loginForm, message, 'login');
        if (!result) return;
        try {
            const response = await fetch('/api/me');
            const account = await response.json();
            if (!response.ok || !account.success || !account.user.isAdmin) {
                await fetch('/api/logout', { method: 'POST' });
                message.textContent = 'This account does not have administrator access.';
                return;
            }
            window.location.assign('/welcome.html');
        } catch (error) {
            message.textContent = 'Could not verify administrator access. Please try again.';
        }
    });

    if (signupForm) signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = document.getElementById('signup-message');
        const result = await submitForm(signupForm, message, 'signup');
        if (result) {
            signupForm.reset();
            message.textContent = 'Account created. You can now sign in.';
            message.classList.add('is-success');
        }
    });
});

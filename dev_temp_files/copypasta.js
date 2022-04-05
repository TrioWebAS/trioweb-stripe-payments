// response from a onSumbit handler uses different stripe token format
const { paymentMethod } = await createPaymentMethod({
    type: 'card',
    card: cardElement,
    billing_details: {
        name: billingName,
        email,
        phone,
        address: {
            city,
            country,
            line1: street[0],
            state
        }
    }
});

if (!paymentMethod) {
    return { token: null, handleAuthorization: null };
}

return {
    token: `${paymentMethod.id}:${paymentMethod.card.brand}:${
        paymentMethod.card.last4
    }`,
    handleAuthorization: handleAuthorization
};

// CONFIRM PAYMENT:
const result = await stripe.confirmCardPayment(CLIENT_SECRET, {
    payment_method: stripe_pm_token
});

/**
 * Handles the response from a card action or a card payment after authorization is complete
 * @param response the API response
 * @param savePaymentInformation
 * @param paymentInformation
 * @returns {boolean} true on success, false otherwise
 */
const handlePostAuthorization = (
    response,
    savePaymentInformation,
    paymentInformation
) => {
    if (response.error) {
        onPaymentError(response.error.message);
        return false;
    }

    savePaymentInformation(paymentInformation);
    return true;
};

/**
 * If card required 3ds authorization - handle it and place order if success
 * @param paymentInformation
 * @param secret
 * @param savePaymentInformation
 */
const handleAuthorization = (
    paymentInformation,
    secret,
    savePaymentInformation
) => {
    return retrievePaymentIntent(secret).then(result => {
        const {
            paymentIntent: { status, confirmation_method }
        } = result;
        if (['requires_action', 'requires_source_action'].includes(status)) {
            if (confirmation_method === 'manual') {
                return handleCardAction(secret).then(
                    /** @namespace StripePayments/Component/InjectedStripeCheckoutForm/Container/handleCardAction/then */
                    response =>
                        handlePostAuthorization(
                            response,
                            savePaymentInformation,
                            paymentInformation
                        )
                );
            }

            return handleCardPayment(secret).then(response =>
                handlePostAuthorization(
                    response,
                    savePaymentInformation,
                    paymentInformation
                )
            );
        }

        return null;
    });
};

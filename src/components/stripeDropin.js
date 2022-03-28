// copied from @magento/venia-ui/lib/components/CheckoutPage/PaymentInformation/brainTreeDropIn.js

/**
 * @fileoverview This component uses StripeJS and react-stripe-elements to hook into Web
 * Payments and the Payment Request API to submit payments via Stripe.
 *
 * @see
 *   https://stripe.com/docs/api
 */

import React, { useEffect, useState, useCallback } from 'react';
import { FormattedMessage } from 'react-intl';
import { bool, func, shape, string } from 'prop-types';

import defaultClasses from '@magento/venia-ui/lib/components/CheckoutPage/PaymentInformation/braintreeDropin.module.css';
import { useStyle } from '@magento/venia-ui/lib/classify';

import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';

/**
 * This StripeDropin component has two purposes which lend to its
 * implementation:
 *
 * 1) Mount and asynchronously create the dropin via the stripe api.
 * 2) On submission (triggered by a parent), request the payment nonce.
 */

const StripeDropin = props => {
    const {
        onError,
        onReady,
        onSuccess,
        shouldRequestPaymentIntent,
        shouldTeardownDropin,
        resetShouldTeardownDropin,
        onCreatePaymentIntent,
        stripeToken
    } = props;

    const classes = useStyle(defaultClasses, props.classes);
    const [isError, setIsError] = useState(false);
    const [readyCalled, setReadyCalled] = useState(false);
    const [dropinInstance, setDropinInstance] = useState();
    const stripe = useStripe();
    const elements = useElements();

    // tell parent we're initiated
    useEffect(() => {
        if (stripe && elements && !readyCalled) {
            setReadyCalled(true);
            onReady(true);
        }
    }, [onReady, readyCalled, stripe, elements]);

    useEffect(() => {
        if (stripeToken) {
            // received stripe client_secret from parent - tell them we got it
            // but...WHY!? TT
            console.log('dropin component was handed a token', stripeToken);
            const secret =
                stripeToken?.createPaymentIntent?.intent_client_secret;
            if (secret) {
                onSuccess(secret);
            } else {
                console.log('there be dragons in dropin component');
            }
        }
    }, [stripeToken, onSuccess]);

    useEffect(() => {
        if (shouldRequestPaymentIntent) {
            // parent told us to ask them for a payment intent.
            // YesYes - wOrkWork!
            onCreatePaymentIntent();
        }
    }, [shouldRequestPaymentIntent, onCreatePaymentIntent]);

    /**
     * This useEffect handles tearing down and re-creating the dropin
     * in case the parent component needs it to.
     *
     * The parent component does this by setting `shouldTeardownDropin` `true`.
     */
    useEffect(() => {
        const teardownAndRenderDropin = async () => {
            console.log(
                'stripe dropin was told to go f* itself. Will not comply'
            );
        };

        if (shouldTeardownDropin) {
            teardownAndRenderDropin();
        }
    }, [shouldTeardownDropin]);

    if (isError) {
        return (
            <span className={classes.error}>
                <FormattedMessage
                    id={'checkoutPage.errorLoadingPayment'}
                    defaultMessage={
                        'There was an error loading payment options. Please try again later.'
                    }
                />
            </span>
        );
    }

    return (
        <div className={classes.root}>
            <CardElement options={{ hidePostalCode: true }} />
        </div>
    );
};

export default StripeDropin;

StripeDropin.propTypes = {
    classes: shape({
        root: string,
        error: string
    }),
    onError: func.isRequired,
    onReady: func.isRequired,
    onSuccess: func.isRequired,
    shouldRequestPaymentIntent: bool.isRequired
};

/**
 * @fileoverview This component uses StripeJS and react-stripe-elements to hook into Web
 * Payments and the Payment Request API to submit payments via Stripe.
 *
 * @see
 *   https://stripe.com/docs/api
 */

import React, { useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { bool, func, shape, string } from 'prop-types';
import defaultClasses from '@magento/venia-ui/lib/components/CheckoutPage/PaymentInformation/braintreeDropin.module.css';
import { useStyle } from '@magento/venia-ui/lib/classify';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const CARD_ELEMENT_OPTIONS = {
    hidePostalCode: true,
    style: {
        base: {
            color: '#32325d',
            fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
            fontSmoothing: 'antialiased',
            fontSize: '16px',
            '::placeholder': {
                color: '#aab7c4'
            }
        },
        invalid: {
            color: '#fa755a',
            iconColor: '#fa755a'
        }
    }
};

const StripeDropin = props => {
    const {
        onError,
        onReady,
        //onSuccess,
        shouldTeardownDropin,
        resetShouldTeardownDropin
    } = props;

    const classes = useStyle(defaultClasses, props.classes);
    const [isError, setIsError] = useState(false);
    const [readyCalled, setReadyCalled] = useState(false);
    const stripe = useStripe();
    const elements = useElements();

    // init - check all APIs are set up
    useEffect(() => {
        if (stripe && elements && !readyCalled) {
            setReadyCalled(true);
            onReady(true);
        }
    }, [onReady, stripe, elements, readyCalled]);

    // handle reset command from parent component or talons
    // TODO: figure out if this should be handled in parent with "return null" in place of this component instead
    useEffect(() => {
        if (shouldTeardownDropin) {
            const err =
                'stripe dropin was told to tear itself down. Will not comply';
            console.log(err);
            setIsError(true);
            onError(err);
            resetShouldTeardownDropin();
        }
    }, [shouldTeardownDropin, resetShouldTeardownDropin, onError]);

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
            <CardElement options={CARD_ELEMENT_OPTIONS} />
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
    //onSuccess: func.isRequired,
    shouldTeardownDropin: bool.isRequired
};

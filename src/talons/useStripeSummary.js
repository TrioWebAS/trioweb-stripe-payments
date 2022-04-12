import { useQuery, useMutation } from '@apollo/client';
import { useCartContext } from '@magento/peregrine/lib/context/cart';

import mergeOperations from '@magento/peregrine/lib/util/shallowMerge';
import { useEffect, useState } from 'react';
import defaultOperations from './stripeSummary.gql';
import { useStripe } from '@stripe/react-stripe-js';
import { CREATE_PAYMENT_INTENT } from './stripe.gql';

const mapBillingAddressData = rawBillingAddressData => {
    if (rawBillingAddressData) {
        const { street, country, region } = rawBillingAddressData;

        return {
            ...rawBillingAddressData,
            street1: street[0],
            street2: street[1],
            country: country.code,
            state: region.label
        };
    } else {
        return {};
    }
};

/**
 * Talon for the stripe summary view.
 *
 * @param {DocumentNode} props.operations operations used by this summary component
 *
 * @returns {
 *   billingAddress: {
 *      firstName: String,
 *      lastName: String,
 *      country: String,
 *      street1: String,
 *      street2: String,
 *      city: String,
 *      state: String,
 *      postalCode: String,
 *   },
 *   paymentMethod: {
 *      type: String,
 *      description: String,
 *      details: {
 *          cardType: String,
 *          lastFour: String,
 *          lastTwo: String
 *      },
 *   },
 *   isBillingAddressSame: Boolean,
 *   isLoading: Boolean,
 * }
 */
export const useStripeSummary = (props = {}) => {
    const stripe = useStripe();

    // TEST ONLY - DON'T THINK WE SHOULD FIRE THIS MULTIPLE TIMES
    const [
        createPaymentIntent,
        {
            error: intentError,
            called: intentCalled,
            loading: intentLoading,
            data: intentData
        }
    ] = useMutation(CREATE_PAYMENT_INTENT);
    const CLIENT_SECRET = intentData?.createPaymentIntent?.intent_client_secret;

    const operations = mergeOperations(defaultOperations, props.operations);
    const { getStripeSummaryData } = operations.queries;

    const [{ cartId }] = useCartContext();
    const { data: summaryData, loading: isLoading } = useQuery(
        getStripeSummaryData,
        {
            skip: !cartId,
            variables: { cartId }
        }
    );

    const billingAddress = summaryData
        ? mapBillingAddressData(summaryData.cart.billingAddress)
        : {};

    const isBillingAddressSame = summaryData
        ? summaryData.cart.isBillingAddressSame
        : true;

    const [paymentMethod, setPaymentMethod] = useState();

    useEffect(() => {
        console.log('got summary dataz', summaryData);
        if (summaryData?.cart?.stripe_payment_method) {
            const pmArray = summaryData.cart.stripe_payment_method.split(':');
            setPaymentMethod({
                id: pmArray[0],
                details: {
                    cardType: pmArray[1],
                    lastFour: pmArray[2]
                }
            });
            /*
            createPaymentIntent({
                variables: { cartId }
            });
            */
        }
    }, [summaryData, cartId]);
    /*
    useEffect(() => {
        // Authorize the payment if required
        const authorizePayment = () => {
            return new Promise((resolve, reject) => {
                stripe.retrievePaymentIntent(CLIENT_SECRET).then(result => {
                    console.log('got paymentIntent from stripe', result);
                    const {
                        paymentIntent: { status, confirmation_method }
                    } = result;
                    if (
                        ['requires_action', 'requires_source_action'].includes(
                            status
                        )
                    ) {
                        if (confirmation_method === 'manual') {
                            resolve(stripe.handleCardAction(CLIENT_SECRET));
                        } else {
                            resolve(stripe.handleCardPayment(CLIENT_SECRET));
                        }
                    }
                    resolve(null);
                });
            });
        };

        if (paymentMethod?.id && CLIENT_SECRET) {
            // got a payment Method in local state
            console.log(
                'new payment Method in summary',
                paymentMethod,
                CLIENT_SECRET
            );
            authorizePayment().then(result => {
                console.log('auth complete', result);
            });
        } else {
            console.log('no payment method in loacl state');
        }
    }, [paymentMethod, CLIENT_SECRET, stripe]);
*/
    //    token: `${paymentMethod.id}:${paymentMethod.card.brand}:${paymentMethod.card.last4}`,
    return {
        billingAddress,
        isBillingAddressSame,
        isLoading,
        paymentMethod
    };
};

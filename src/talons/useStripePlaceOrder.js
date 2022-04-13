import { CREATE_PAYMENT_INTENT, GET_PAYMENT_METHOD } from './stripe.gql';
import { useStripe } from '@stripe/react-stripe-js';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
    useApolloClient,
    useLazyQuery,
    useMutation,
    useQuery
} from '@apollo/client';

import { useCartContext } from '@magento/peregrine/lib/context/cart';

import mergeOperations from '@magento/peregrine/lib/util/shallowMerge';

import DEFAULT_OPERATIONS from '@magento/peregrine/lib/talons/CheckoutPage/checkoutPage.gql.js';

import CheckoutError from '@magento/peregrine/lib/talons/CheckoutPage/CheckoutError';
import { useGoogleReCaptcha } from '@magento/peregrine/lib/hooks/useGoogleReCaptcha';

// define our own placeOrder logic to implement stripe authorization
export const useStripePlaceOrder = props => {
    const stripe = useStripe();
    const [{ cartId }, { createCart, removeCart }] = useCartContext();
    const apolloClient = useApolloClient();
    const operations = mergeOperations(DEFAULT_OPERATIONS, props.operations);
    // COPIED FRO ORIGINAL
    const {
        createCartMutation,
        getCheckoutDetailsQuery,
        getCustomerQuery,
        getOrderDetailsQuery,
        placeOrderMutation
    } = operations;

    const { generateReCaptchaData, recaptchaWidgetProps } = useGoogleReCaptcha({
        currentForm: 'PLACE_ORDER',
        formAction: 'placeOrder'
    });

    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [placeOrderButtonClicked, setPlaceOrderButtonClicked] = useState(
        false
    );
    const [fetchCartId] = useMutation(createCartMutation);
    const [
        getOrderDetails,
        { data: orderDetailsData, loading: orderDetailsLoading }
    ] = useLazyQuery(getOrderDetailsQuery, {
        // We use this query to fetch details _just_ before submission, so we
        // want to make sure it is fresh. We also don't want to cache this data
        // because it may contain PII.
        fetchPolicy: 'no-cache'
    });
    const [
        placeOrder,
        {
            data: placeOrderData,
            error: placeOrderError,
            loading: placeOrderLoading
        }
    ] = useMutation(placeOrderMutation);

    const checkoutError = useMemo(() => {
        if (placeOrderError) {
            const errorString = placeOrderError.toString();
            const CLIENT_SECRET = errorString.substr(
                errorString.indexOf('pi_')
            );
            console.log('got placeOrderError', placeOrderError, CLIENT_SECRET);
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
                    console.log('AUTHORIZING CARD! YAY!');
                    if (confirmation_method === 'manual') {
                        stripe.handleCardAction(CLIENT_SECRET).then(result => {
                            console.log('AUTH RESULT', result);
                        });
                    } else {
                        stripe.handleCardPayment(CLIENT_SECRET).then(result => {
                            console.log('AUTH RESULT', result);
                        });
                    }
                }
                console.log('should return placeOrder error', placeOrderError);
                return null;
                //return new CheckoutError(placeOrderError);
            });
        }
    }, [placeOrderError]);

    const handlePlaceStripeOrder = useCallback(async () => {
        // Fetch order details and then use an effect to actually place the
        // order. If/when Apollo returns promises for invokers from useLazyQuery
        // we can just await this function and then perform the rest of order
        // placement.
        await getOrderDetails({
            variables: {
                cartId
            }
        });
        setPlaceOrderButtonClicked(true);
        setIsPlacingOrder(true);
    }, [cartId, getOrderDetails]);

    useEffect(() => {
        async function placeOrderAndCleanup() {
            try {
                const reCaptchaData = await generateReCaptchaData();

                await placeOrder({
                    variables: {
                        cartId
                    },
                    ...reCaptchaData
                });
                // Cleanup stale cart and customer info.
                await removeCart();
                await apolloClient.clearCacheData(apolloClient, 'cart');

                await createCart({
                    fetchCartId
                });
            } catch (err) {
                console.error(
                    'An error occurred during when placing the order',
                    err
                );
                setPlaceOrderButtonClicked(false);
            }
        }

        if (orderDetailsData && isPlacingOrder) {
            setIsPlacingOrder(false);
            placeOrderAndCleanup();
        }
    }, [
        apolloClient,
        cartId,
        createCart,
        fetchCartId,
        generateReCaptchaData,
        orderDetailsData,
        placeOrder,
        removeCart,
        isPlacingOrder
    ]);

    return {
        error: checkoutError,
        handlePlaceOrder: handlePlaceStripeOrder,
        hasError: !!checkoutError,
        orderDetailsData,
        orderDetailsLoading,
        orderNumber:
            (placeOrderData && placeOrderData.placeOrder.order.order_number) ||
            null,
        placeOrderLoading
    };
    // check if we need to replace handlePlaceOrder with logic for authorizing a stripe payment

    /*
    const stripe = useStripe();
    const [createPaymentIntent, { data: intentData }] = useMutation(
        CREATE_PAYMENT_INTENT
    );
    const CLIENT_SECRET = intentData?.createPaymentIntent?.intent_client_secret;
    */

    //createPaymentIntent({ variables: { cartId } });
    // DEV NOTE:
    /**
     * No use in trying to create a new intent and checking the status in strip, as it will be detatched from the payment method anyways TT
     * Prob need to try-catch the original placeOrder or somth.
     */
};

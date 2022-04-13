// copied from @magento/peregrine/lib/talons/CheckoutPage/PaymentInformation/useCreditCard.js
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useFormState, useFormApi } from 'informed';
import { useQuery, useApolloClient, useMutation } from '@apollo/client';
import mergeOperations from '@magento/peregrine/lib/util/shallowMerge';

import { useCartContext } from '@magento/peregrine/lib/context/cart';

import BRAINTREE_OPERATIONS from '@magento/peregrine/lib/talons/CheckoutPage/PaymentInformation/creditCard.gql';
import STRIPE_OPERATIONS from './stripe.gql';
import { useGoogleReCaptcha } from '@magento/peregrine/lib/hooks/useGoogleReCaptcha';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const getRegion = region => {
    return region.region_id || region.label || region.code;
};

/**
 * Maps address response data from GET_BILLING_ADDRESS and GET_SHIPPING_ADDRESS
 * queries to input names in the billing address form.
 * {@link creditCard.gql.js}.
 *
 * @param {ShippingCartAddress|BillingCartAddress} rawAddressData query data
 */
import { mapAddressData } from '@magento/peregrine/lib/talons/CheckoutPage/PaymentInformation/useCreditCard.js';

/**
 * Talon to handle Credit Card payment method.
 *
 * @param {Boolean} props.shouldSubmit boolean value which represents if a payment paymentIntent request has been submitted
 * @param {Function} props.onSuccess callback to invoke when the a payment paymentIntent has been generated
 * @param {Function} props.onReady callback to invoke when the stripe dropin component is ready
 * @param {Function} props.onError callback to invoke when the stripe dropin component throws an error
 * @param {Function} props.resetShouldSubmit callback to reset the shouldSubmit flag
 * @param {DocumentNode} props.operations.getBillingAddressQuery query to fetch billing address from cache
 * @param {DocumentNode} props.operations.getIsBillingAddressSameQuery query to fetch is billing address same checkbox value from cache
 * @param {DocumentNode} props.operations.setBillingAddressMutation mutation to update billing address on the cart
 *
 * NOT IN USE - FROM BRAINTREE
 * @param {DocumentNode} props.operations.getPaymentNonceQuery query to fetch payment nonce saved in cache
 * @param {DocumentNode} props.operations.setCreditCardDetailsOnCartMutation mutation to update payment method and payment nonce on the cart
 *
 * FROM LOCAL STRIPE GQL:
 * @param {DocumentNode} props.operations.getStripeConfigQuery GET_STRIPE_CONFIG_DATA,
 * @param {DocumentNode} props.operations.setPaymentMethodOnCartMutation SET_PAYMENT_METHOD_ON_CART,
 * @param {DocumentNode} props.operations.getPaymentIntentQuery query to fetch payment intent saved in cache - replaces getPaymentNonceQuery,
 * @param {DocumentNode} props.operations.setStripeCreditCardDetailsOnCartMutation mutation to update payment method - replaces setCreditCardDetailsOnCartMutation
 * @param {DocumentNode} props.createPaymentIntentMutation mutation to create a payment intent on the M2 backend. returns a CLIENT_SECTRET
 *
 * @returns {
 *   errors: Map<String, Error>,
 *   isBillingAddressSame: Boolean,
 *   isLoading: Boolean,
 *   stepNumber: Number,
 *   initialValues: {
 *      firstName: String,
 *      lastName: String,
 *      city: String,
 *      postcode: String,
 *      phoneNumber: String,
 *      street1: String,
 *      street2: String,
 *      country: String,
 *      state: String,
 *      isBillingAddressSame: Boolean
 *   },
 *   shippingAddressCountry: String,
 *   shouldTeardownDropin: Boolean,
 * }
 */
export const useCreditCard = props => {
    const {
        onSuccess,
        onReady,
        onError,
        shouldSubmit,
        resetShouldSubmit
    } = props;

    const operations = mergeOperations(
        BRAINTREE_OPERATIONS,
        STRIPE_OPERATIONS,
        props.operations
    );

    const {
        getBillingAddressQuery,
        getIsBillingAddressSameQuery,
        getShippingAddressQuery,
        setBillingAddressMutation,
        setStripeCreditCardDetailsOnCartMutation,
        getPaymentMethodQuery,
        createPaymentIntentMutation
    } = operations;

    const {
        recaptchaLoading,
        generateReCaptchaData,
        recaptchaWidgetProps
    } = useGoogleReCaptcha({
        currentForm: 'STRIPE_PAYMENTS',
        formAction: 'stripe_payments'
    });

    const stripe = useStripe();
    //const { retrievePaymentIntent, handleCardAction, handleCardPayment, createPaymentMethod } = stripe;
    const elements = useElements();

    const [isStripeJSLoading, setStripeJSLoading] = useState(true);
    const [shouldRequestPayment, setShouldRequestPayment] = useState(false);
    const [shouldTeardownDropin, setShouldTeardownDropin] = useState(false);

    /**
     * `stepNumber` depicts the state of the process flow in credit card
     * payment flow.
     *
     * `0` No call made yet
     * `1` Billing address mutation initiated
     * `2` stripe paymentIntent requested
     * `3` Payment information mutation initiated
     * `4` All mutations done
     */
    const [stepNumber, setStepNumber] = useState(0);

    const client = useApolloClient();
    const formState = useFormState();
    const { validate: validateBillingAddressForm } = useFormApi();
    const [{ cartId }] = useCartContext();

    const isLoading =
        isStripeJSLoading ||
        recaptchaLoading ||
        (stepNumber >= 1 && stepNumber <= 3);

    /**
     * GQL DATA QUERIES
     */
    const { data: billingAddressData } = useQuery(getBillingAddressQuery, {
        skip: !cartId,
        variables: { cartId }
    });
    const { data: shippingAddressData } = useQuery(getShippingAddressQuery, {
        skip: !cartId,
        variables: { cartId }
    });
    const { data: isBillingAddressSameData } = useQuery(
        getIsBillingAddressSameQuery,
        { skip: !cartId, variables: { cartId } }
    );
    const { data: stripePaymentMethodData } = useQuery(getPaymentMethodQuery, {
        skip: !cartId,
        variables: { cartId }
    });

    /**
     * GQL MUTATIONS TO INTERACT WITH THE GQL BACKEND OR CACHE
     */

    /**
     * 1) Mutation to create a stripe.paymentIntent on cart in M2 backend
     *
     * invoked automatically when StripeJS APIS have finished loading
     * backend returns a CLIENT_SECRET for future use with stripeJS API calls
     */
    const [createPaymentIntent, { data: intentData }] = useMutation(
        createPaymentIntentMutation
    );
    const CLIENT_SECRET = intentData?.createPaymentIntent?.intent_client_secret;

    /**
     * 2) Mutation to save billing address on cart in M2 backend
     *
     * User invokes this when perssing the "view order" button
     * We listen to this event for triggering a stripe.paymentMethod fetch
     */
    const [
        updateBillingAddress,
        {
            error: billingAddressMutationError,
            called: billingAddressMutationCalled,
            loading: billingAddressMutationLoading
        }
    ] = useMutation(setBillingAddressMutation);

    /**
     * 3) Method to save the stripe.paymentMethod in GQL client cache
     * Note: We use cache because there is no way to save this information on the cart in M2 backend.
     *
     * This is invoked by useEffect when we get a new paymentMethod object from stripeJS
     * We listen for this event to trigger stripe authorization
     */

    const setPaymentMethodInCache = useCallback(
        paymentMethod => {
            /*
            // FULL DATASET FROM STRIPE FOR REFERENCES:
            const stripeResponse = {
                id,
                object, // string ("payment_method")
                billing_details: {
                    address, // object
                    email, // string
                    name, // string
                    phone, // string
                },
                card: {
                    brand, // string ("visa")
                    checks, // object
                    country, // string ("US")
                    exp_month, // number
                    exp_year, // number
                    funding, // string ("credit")
                    generated_from, // null
                    last4 // string ("4242")
                }
                created, // timestamp
                customer, // null
                livemode, // bool (false)
                type // string ("card")
            } = paymentMethod;
            */
            const token = `${paymentMethod.id}:${paymentMethod.card.brand}:${
                paymentMethod.card.last4
            }`;
            client.writeQuery({
                query: getPaymentMethodQuery,
                data: {
                    cart: {
                        __typename: 'Cart',
                        id: cartId,
                        stripe_payment_method: token
                    }
                }
            });
        },
        [cartId, client, getPaymentMethodQuery]
    );

    /**
     * 4) Mutation to save the stripe.paymentMethod.id reference on cart in M2 backend
     *
     * This is invoked automatically when Stripe has authorized the full paymentIntent
     */
    const [
        updateCCDetails,
        {
            error: ccMutationError,
            called: ccMutationCalled,
            loading: ccMutationLoading
        }
    ] = useMutation(setStripeCreditCardDetailsOnCartMutation);

    /**
     * MISC DATASETS
     */

    const shippingAddressCountry = shippingAddressData
        ? shippingAddressData.cart.shippingAddresses[0].country.code
        : DEFAULT_COUNTRY_CODE;
    const isBillingAddressSame = formState.values.isBillingAddressSame;

    const initialValues = useMemo(() => {
        const isBillingAddressSame = isBillingAddressSameData
            ? isBillingAddressSameData.cart.isBillingAddressSame
            : true;

        let billingAddress = {};
        /**
         * If billing address is same as shipping address, do
         * not auto fill the fields.
         */
        if (billingAddressData && !isBillingAddressSame) {
            if (billingAddressData.cart.billingAddress) {
                const {
                    // eslint-disable-next-line no-unused-vars
                    __typename,
                    ...rawBillingAddress
                } = billingAddressData.cart.billingAddress;
                billingAddress = mapAddressData(rawBillingAddress);
            }
        }

        return { isBillingAddressSame, ...billingAddress };
    }, [isBillingAddressSameData, billingAddressData]);

    /**
     * Helpers
     */

    /**
     * This function sets the boolean isBillingAddressSame
     * in cache for future use. We use cache because there
     * is no way to save this on the cart in remote.
     */
    const setIsBillingAddressSameInCache = useCallback(() => {
        client.writeQuery({
            query: getIsBillingAddressSameQuery,
            data: {
                cart: {
                    __typename: 'Cart',
                    id: cartId,
                    isBillingAddressSame
                }
            }
        });
    }, [client, cartId, getIsBillingAddressSameQuery, isBillingAddressSame]);

    /**
     * This function sets the billing address on the cart using the
     * shipping address.
     */
    const setShippingAddressAsBillingAddress = useCallback(() => {
        const shippingAddress = shippingAddressData
            ? mapAddressData(shippingAddressData.cart.shippingAddresses[0])
            : {};

        updateBillingAddress({
            variables: {
                cartId,
                ...shippingAddress,
                sameAsShipping: true
            }
        });
    }, [updateBillingAddress, shippingAddressData, cartId]);

    /**
     * This function sets the billing address on the cart using the
     * information from the form.
     */
    const setBillingAddress = useCallback(() => {
        const {
            firstName,
            lastName,
            country,
            street1,
            street2,
            city,
            region,
            postcode,
            phoneNumber
        } = formState.values;

        updateBillingAddress({
            variables: {
                cartId,
                firstName,
                lastName,
                country,
                street1,
                street2: street2 || '',
                city,
                region: getRegion(region),
                postcode,
                phoneNumber,
                sameAsShipping: false
            }
        });
    }, [formState.values, updateBillingAddress, cartId]);

    /**
     * This function saves the paymentMethod.id (token) from stripe
     */
    const updateCCDetailsOnCart = useCallback(
        async stripeToken => {
            try {
                const reCaptchaData = await generateReCaptchaData();

                await updateCCDetails({
                    variables: {
                        cartId,
                        stripeToken: stripeToken,
                        save: false
                    },
                    ...reCaptchaData
                });
            } catch (error) {
                // Error is logged by apollo link - no need to double log.
            }
        },
        [updateCCDetails, cartId, generateReCaptchaData]
    );

    /**
     * Generic helper function to be called when the things hit the fan
     */
    const onPaymentError = useCallback(
        error => {
            setStepNumber(0);
            setShouldRequestPayment(false);
            resetShouldSubmit();
            if (onError) {
                onError(error);
            }
        },
        [onError, resetShouldSubmit]
    );

    /**
     * INIT (once all APIs are set up)
     * fire the mutation to make payment intent on backend server
     * useEffect listener below will update step when CLIENT_SECRET is received from M2 backend
     **/
    useEffect(() => {
        if (stripe && elements && isStripeJSLoading) {
            setStripeJSLoading(false);
            setStepNumber(0);
            if (onReady) {
                onReady();
            }
        }
    }, [stripe, elements, isStripeJSLoading, onReady]);

    /**
     * EFFECTS
     */

    /**
     * Step 1 effect
     *
     * User has clicked the update button
     */
    useEffect(() => {
        try {
            if (shouldSubmit) {
                /**
                 * Validate billing address fields and only process with
                 * submit if there are no errors.
                 *
                 * We do this because the user can click Review Order button
                 * without fillig in all fields and the form submission
                 * happens manually. The informed Form component validates
                 * on submission but that only happens when we use the onSubmit
                 * prop. In this case we are using manually submission because
                 * of the nature of the credit card submission process.
                 */
                validateBillingAddressForm();

                const hasErrors = Object.keys(formState.errors).length;

                if (!hasErrors) {
                    setStepNumber(1);
                    if (isBillingAddressSame) {
                        setShippingAddressAsBillingAddress();
                    } else {
                        setBillingAddress();
                    }
                    setIsBillingAddressSameInCache();
                } else {
                    throw new Error('Errors in the billing address form');
                }
            }
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(err);
            }
            setStepNumber(0);
            resetShouldSubmit();
            setShouldRequestPayment(false);
        }
    }, [
        shouldSubmit,
        isBillingAddressSame,
        setShippingAddressAsBillingAddress,
        setBillingAddress,
        setIsBillingAddressSameInCache,
        resetShouldSubmit,
        validateBillingAddressForm,
        formState.errors
    ]);

    /**
     * Step 2 effect
     *
     * Billing address mutation has completed
     */
    useEffect(() => {
        try {
            const billingAddressMutationCompleted =
                billingAddressMutationCalled && !billingAddressMutationLoading;

            if (
                billingAddressMutationCompleted &&
                !billingAddressMutationError
            ) {
                /**
                 * Billing address save mutation is successful
                 * we can initiate the stripe paymentMethod request
                 */
                setStepNumber(2);
                setShouldRequestPayment(true);
            }

            if (
                billingAddressMutationCompleted &&
                billingAddressMutationError
            ) {
                /**
                 * Billing address save mutation is not successful.
                 * Reset update button clicked flag.
                 */
                throw new Error('Billing address mutation failed');
            }
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(err);
            }
            setStepNumber(0);
            resetShouldSubmit();
            setShouldRequestPayment(false);
        }
    }, [
        billingAddressMutationError,
        billingAddressMutationCalled,
        billingAddressMutationLoading,
        resetShouldSubmit
    ]);

    /**
     * billing address is set, and shouldRequestPayment changed
     * create a StripeJS paymentMethod and authorize it if needed
     * Set payment details on cart when done
     */
    useEffect(() => {
        if (shouldRequestPayment && billingAddressData?.cart?.billingAddress) {
            try {
                console.log(
                    'should request paymentMethod',
                    billingAddressData.cart.billingAddress
                );
                const {
                    firstName,
                    lastName,
                    email,
                    phoneNumber,
                    street,
                    postcode,
                    city,
                    country_id
                } = billingAddressData.cart.billingAddress;
                if (!stripe || !elements || !firstName) {
                    // Stripe.js has not yet loaded.
                    // Make sure to disable form submission until Stripe.js has loaded.
                    if (process.env.NODE_ENV !== 'production') {
                        console.error(
                            'billingAddress or API missing on paymentMethod req.',
                            firstname
                        );
                    }
                    /**
                     * Billing address save mutation is not successful.
                     * Reset update button clicked flag.
                     */
                    throw new Error('PaymentMethod request failed');
                }

                const createPaymentMethod = async () => {
                    const { paymentMethod } = await stripe.createPaymentMethod({
                        type: 'card',
                        card: elements.getElement(CardElement),
                        billing_details: {
                            name: firstName + ' ' + lastName,
                            email: email,
                            phone: phoneNumber,
                            address: {
                                line1: street[0],
                                postal_code: postcode,
                                city: city,
                                country: country_id
                            }
                        }
                    });
                    if (!paymentMethod?.id) {
                        if (process.env.NODE_ENV !== 'production') {
                            console.error(
                                'Failed to create stripeJS paymentMethod'
                            );
                        }
                    } else {
                        updateCCDetailsOnCart(paymentMethod.id);
                        setPaymentMethodInCache(paymentMethod);
                    }
                };
                createPaymentMethod();
            } catch (err) {
                onPaymentError(err);
            }
        } else {
            console.info('shouldrequest method with no billingaddress');
        }
    }, [
        shouldRequestPayment,
        stripe,
        elements,
        billingAddressData,
        setPaymentMethodInCache,
        onPaymentError,
        CLIENT_SECRET,
        updateCCDetailsOnCart
    ]);

    /*
    useEffect(() => {
        // Authorize the payment if required
        const authorizePayment = async stripe_pm_token => {
            //return new Promise((resolve, reject) => {


            const result = await stripe.confirmCardPayment(CLIENT_SECRET, {
                payment_method: stripe_pm_token
            }).then(result => {
                console.log('confirmed payment', result);
                stripe.retrievePaymentIntent(CLIENT_SECRET).then(result => {
                    console.log('got paymentIntent from stripe', result);
                    const {
                        paymentIntent: { status, confirmation_method }
                    } = result;
                    if (['requires_action', 'requires_source_action'].includes(status)) {
                        if (confirmation_method === 'manual') {
                            return stripe.handleCardAction(CLIENT_SECRET);
                        } else {
                            return stripe.handleCardPayment(CLIENT_SECRET);
                        }
                    }
                    return null;
                });
            });

            return result;
        }
        if (paymentMethod?.id) {
            // got a payment Method in local state
            console.log('new payment Method in local state', paymentMethod);
            authorizePayment(paymentMethod.id).then(result => {
                console.log('auth complete', result);
                updateCCDetailsOnCart(paymentMethod.id);
            });
        }
    }, [paymentMethod, CLIENT_SECRET, stripe, updateCCDetailsOnCart]);
*/

    useEffect(() => {
        if (stripePaymentMethodData) {
            console.log(
                'paymentMethod found in cache',
                stripePaymentMethodData
            );
            createPaymentIntent({
                variables: { cartId }
            });
        } else {
            console.log('no payment method yet');
        }
    }, [stripePaymentMethodData, stripe, createPaymentIntent, cartId]);

    /**
     * Step 3 effect
     *
     * Credit card save mutation has completed
     */
    useEffect(() => {
        /**
         * Saved billing address and payment method on cart.
         *
         * Time to call onSuccess.
         */

        try {
            const ccMutationCompleted = ccMutationCalled && !ccMutationLoading;

            if (ccMutationCompleted && !ccMutationError && CLIENT_SECRET) {
                const authorizePayment = async () => {
                    //return new Promise((resolve, reject) => {

                    // DO NOT USE - WIP reference only!
                    // Steal all the moneys directly from client - without placing the order
                    /*
                    const result = await stripe.confirmCardPayment(CLIENT_SECRET, {
                        payment_method: stripe_pm_token
                    }).then(result => {
                    */

                    // PROBLEM! The paymentIntent still has status 'requires_payment_method' :((
                    // If we let checkout.js fire the placeOrder() gql it will result in Stripe Error(authentication_required)
                    console.log('cart has payment method now. authorizing');
                    stripe.retrievePaymentIntent(CLIENT_SECRET).then(result => {
                        console.log('got paymentIntent from stripe', result);
                        const {
                            paymentIntent: { status, confirmation_method }
                        } = result;
                        if (
                            [
                                'requires_action',
                                'requires_source_action'
                            ].includes(status)
                        ) {
                            if (confirmation_method === 'manual') {
                                return stripe.handleCardAction(CLIENT_SECRET);
                            } else {
                                return stripe.handleCardPayment(CLIENT_SECRET);
                            }
                        }
                        return null;
                    });
                };
                if (CLIENT_SECRET) {
                    // got a payment Method in local state
                    authorizePayment().then(result => {
                        console.log('auth complete', result);
                        if (onSuccess) {
                            console.log('onSuccees will be called now');
                            onSuccess();
                        }
                        resetShouldSubmit();
                        setStepNumber(4);
                    });
                }
            }

            if (ccMutationCompleted && ccMutationError) {
                /**
                 * If credit card mutation failed, reset update button clicked so the
                 * user can click again and set `stepNumber` to 0.
                 */
                console.log('GOT CREDIT CARD MUTATION ERROR', ccMutationError);

                throw new Error(
                    'Credit card paymentIntent save mutation failed.'
                );
            }
        } catch (err) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(err);
            }
            setStepNumber(0);
            resetShouldSubmit();
            setShouldRequestPayment(false);
            setShouldTeardownDropin(true);
        }
    }, [
        ccMutationCalled,
        ccMutationLoading,
        onSuccess,
        setShouldRequestPayment,
        resetShouldSubmit,
        ccMutationError,
        CLIENT_SECRET,
        stripe
    ]);

    const errors = useMemo(
        () =>
            new Map([
                ['setBillingAddressMutation', billingAddressMutationError],
                ['setCreditCardDetailsOnCartMutation', ccMutationError]
            ]),
        [billingAddressMutationError, ccMutationError]
    );

    return {
        errors,
        isBillingAddressSame,
        isLoading,
        stepNumber,
        initialValues,
        shippingAddressCountry,
        shouldTeardownDropin,
        recaptchaWidgetProps
    };
};

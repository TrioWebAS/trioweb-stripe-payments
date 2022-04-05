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
 *   shouldRequestPayment: Boolean,
 *   onPaymentError: Function,
 *   onPaymentSuccess: Function,
 *   onPaymentReady: Function,
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
 *   resetShouldTeardownDropin: Function
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

    const [isDropinLoading, setDropinLoading] = useState(true);
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
        isDropinLoading ||
        recaptchaLoading ||
        (stepNumber >= 1 && stepNumber <= 3);

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
    const [
        updateBillingAddress,
        {
            error: billingAddressMutationError,
            called: billingAddressMutationCalled,
            loading: billingAddressMutationLoading
        }
    ] = useMutation(setBillingAddressMutation);

    const [
        updateCCDetails,
        {
            error: ccMutationError,
            called: ccMutationCalled,
            loading: ccMutationLoading
        }
    ] = useMutation(setStripeCreditCardDetailsOnCartMutation);

    // Expose a function to create a new payment intent
    // first define the gql mutation as a std func via useMutation
    const [
        createPaymentIntent,
        {
            error: intentError,
            called: intentCalled,
            loading: intentLoading,
            data: intentData
        }
    ] = useMutation(createPaymentIntentMutation);

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
     * This function sets the payment intent details in the cache.
     * We use cache because there is no way to save this information
     * on the cart in the remote.
     */
    const setPaymentDetailsInCache = useCallback(
        stripeToken => {
            /**
             * We dont save the intent code due to PII,
             * we only save the subset of details.
             */
            client.writeQuery({
                query: getPaymentMethodQuery,
                data: {
                    cart: {
                        __typename: 'Cart',
                        id: cartId,
                        cc_stripejs_token: stripeToken
                    }
                }
            });
        },
        [cartId, client, getPaymentMethodQuery]
    );

    /**
     * This function saves the paymentintent client_secret from stripe
     * on the cart along with the payment method used in
     * this case `stripe_payments`.
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
     * Function to be called by the stripe dropin when the
     * paymentMethod generation is successful.
     */
    const onPaymentSuccess = useCallback(
        stripeToken => {
            console.log('onPaymentSucces runs', stripeToken);
            setPaymentDetailsInCache(stripeToken);
            /**
             * Updating selected payment method on cart.
             */
            updateCCDetailsOnCart(stripeToken);
            setStepNumber(3);
        },
        [setPaymentDetailsInCache, updateCCDetailsOnCart]
    );

    /**
     * Function to be called by the stripe dropin when the
     * paymentIntent generation is not successful.
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
     * Function to be called by the stripe dropin when the
     * credit card component has loaded successfully.
     */
    const onPaymentReady = useCallback(() => {
        // fire the mutation to make payment intent on backend server
        // useEffect listener below will update states when intent is received
        createPaymentIntent({
            variables: { cartId }
        });
    }, [createPaymentIntent, cartId]);

    // update states when paymentIntent created
    useEffect(() => {
        if (intentData) {
            console.log('paymentIntent changed', intentData);
            setDropinLoading(false);
            setStepNumber(0);
            if (onReady) {
                onReady();
            }
        }
    }, [intentData, onReady]);

    /**
     * Function to be called by stripe dropin when the payment
     * teardown is done successfully before re creating the new dropin.
     */
    const resetShouldTeardownDropin = useCallback(() => {
        setShouldTeardownDropin(false);
    }, []);

    /**
     * Effects
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
                 * we can initiate the stripe paymentIntent request
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
     * Step 2-3 transition
     * shouldRequestPayment changed
     * ...no need to pass this back and forth between the visual component
     * - let's handle everything here and fire onPaymentSuccess afterwards
     */
    useEffect(() => {
        if (shouldRequestPayment) {
            console.log('should request paymentMethod');
            /*
            const CLIENT_SECRET =
                intentData?.createPaymentIntent?.intent_client_secret;
*/
            if (!stripe || !elements || !billingAddressData) {
                // Stripe.js has not yet loaded.
                // Make sure to disable form submission until Stripe.js has loaded.
                onPaymentError('Failed to request payment method from stripe');
                return;
            }

            const {
                firstname,
                lastname,
                email,
                telephone,
                street,
                postcode,
                city,
                country_id
            } = billingAddressData;

            const createPaymentMethod = async () => {
                const { paymentMethod } = await stripe.createPaymentMethod({
                    type: 'card',
                    card: elements.getElement(CardElement),
                    billing_details: {
                        name: firstname + ' ' + lastname,
                        email: email,
                        phone: telephone,
                        address: {
                            line1: street,
                            postal_code: postcode,
                            city: city,
                            country: country_id
                        }
                    }
                });

                if (!paymentMethod?.id) {
                    console.warn('Failed to create stripe payment method');
                } else {
                    onPaymentSuccess(paymentMethod.id);
                    // TODO: figure out if the id is all we really need:
                    // found some interesting references on token usage.
                    // token: `${paymentMethod.id}:${paymentMethod.card.brand}:${paymentMethod.card.last4}`,
                }
            };
            createPaymentMethod();
        }
    }, [
        stripe,
        elements,
        shouldRequestPayment,
        intentData,
        billingAddressData,
        onPaymentError,
        onPaymentSuccess
    ]);

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

            if (ccMutationCompleted && !ccMutationError) {
                if (onSuccess) {
                    onSuccess();
                }
                resetShouldSubmit();
                setStepNumber(4);
            }

            if (ccMutationCompleted && ccMutationError) {
                /**
                 * If credit card mutation failed, reset update button clicked so the
                 * user can click again and set `stepNumber` to 0.
                 */
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
        ccMutationError
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
        onPaymentError,
        onPaymentSuccess,
        onPaymentReady,
        isBillingAddressSame,
        isLoading,
        shouldRequestPayment,
        stepNumber,
        initialValues,
        shippingAddressCountry,
        shouldTeardownDropin,
        resetShouldTeardownDropin,
        recaptchaWidgetProps
    };
};

/**
 * This is a top-level React Context Provider that wraps the entire app.
 * Checkout can then access this context to ensure the same instances is used between components
 */
import React from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useQuery } from '@apollo/client';
import { GET_STRIPE_CONFIG_DATA } from '../talons/stripe.gql';

const StripeProvider = props => {
    // load stripe key from backend via graphql
    const { data } = useQuery(GET_STRIPE_CONFIG_DATA);
    const { stripe_mode, stripe_live_pk, stripe_test_pk } =
        data?.storeConfig || {};
    const stripeKey = stripe_mode === 'test' ? stripe_test_pk : stripe_live_pk;

    // init stripeJS
    const stripeJsPromise = loadStripe(stripeKey);

    // Provide stripe elements and stripeJS as a React Context Provider
    return <Elements stripe={stripeJsPromise}>{props.children}</Elements>;
};
export default StripeProvider;

import { gql } from '@apollo/client';

export const GET_STRIPE_CONFIG_DATA = gql`
    query stripeConfigData {
        # eslint-disable-next-line @graphql-eslint/require-id-when-available
        storeConfig {
            store_code
            stripe_mode
            stripe_live_pk
            stripe_test_pk
        }
    }
`;

export const SET_PAYMENT_METHOD_ON_CART = gql`
    mutation setPaymentMethodOnCart($cartId: String!) {
        setPaymentMethodOnCart(
            input: {
                cart_id: $cartId
                payment_method: { code: "stripe_payments" }
            }
        ) {
            cart {
                id
                selected_payment_method {
                    code
                    title
                }
            }
        }
    }
`;

export const GET_PAYMENT_INTENT = gql`
    query getPaymentIntent($cartId: String!) {
        cart(cart_id: $cartId) @client {
            id
            cc_stripejs_token
        }
    }
`;

export const CREATE_PAYMENT_INTENT = gql`
    mutation createPaymentIntent($cartId: String!) {
        createPaymentIntent(input: { guest_cart_id: $cartId }) {
            intent_client_secret
        }
    }
`;

export const SET_CC_DETAILS_ON_CART = gql`
    mutation setSelectedPaymentMethod(
        $cartId: String!
        $stripeToken: String!
        $save: Boolean!
    ) {
        setPaymentMethodOnCart(
            input: {
                cart_id: $cartId
                payment_method: {
                    code: "stripe_payments"
                    stripe_payments: {
                        cc_save: $save
                        cc_stripejs_token: $stripeToken
                    }
                }
            }
        ) {
            cart {
                id
                selected_payment_method {
                    code
                    title
                }
            }
        }
    }
`;

export default {
    getStripeConfigQuery: GET_STRIPE_CONFIG_DATA,
    //setPaymentMethodOnCartMutation: SET_PAYMENT_METHOD_ON_CART,
    getPaymentIntentQuery: GET_PAYMENT_INTENT,
    setStripeCreditCardDetailsOnCartMutation: SET_CC_DETAILS_ON_CART,
    createPaymentIntentMutation: CREATE_PAYMENT_INTENT
};

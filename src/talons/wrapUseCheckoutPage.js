import { GET_PAYMENT_METHOD } from './stripe.gql';
import { useQuery } from '@apollo/client';
import { useCartContext } from '@magento/peregrine/lib/context/cart';
import { useStripePlaceOrder } from './useStripePlaceOrder';

export default original => {
    return function useTriowebCheckoutPage(props = {}) {
        // Run the original talon from @peregrine
        const defaultReturnData = original(props);

        // Check if we have a stripe_payment paymentMethod in Apollo Cache
        const [{ cartId }] = useCartContext();
        const { data: stripePaymentMethodData } = useQuery(GET_PAYMENT_METHOD, {
            skip: !cartId,
            variables: { cartId }
        });
        const stripeOverrides = useStripePlaceOrder(props);

        if (stripePaymentMethodData) {
            // stripe_payment in use
            // replace the handlePlaceOrder method of @peregrine talon
            console.log('using stripe payment', stripePaymentMethodData);
            return {
                ...defaultReturnData,
                ...stripeOverrides
            };
        } else {
            // not using stripe_payment
            // return the original data from @peregrine talon
            return defaultReturnData;
        }
    };
};

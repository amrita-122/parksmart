import { useLocation, useNavigate } from "react-router-dom";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import axios from "axios";
import { API_URL } from "../config";

export default function Payment() {
  const { state } = useLocation();
  const { spotId, startTime, endTime, amount } = state || {};
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");


  const handleStripePayment = async () => {
    try {
      // 1. Create payment intent (the server prices it from the booked times)
      const { data: clientSecret } = await axios.post(
        `${API_URL}/api/payment/create-intent`,
        { startTime, endTime },
        { headers: { Authorization: `Bearer ${token}` } }
      );
  
      // 2. Confirm Stripe payment
      const cardElement = elements.getElement(CardElement);
      const { paymentIntent, error } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement },
      });
  
      if (error) {
        alert("Payment failed: " + error.message);
        return;
      }
  
      // 3. ✅ Save the payment to your DB FIRST
      await axios.post(
        `${API_URL}/api/payment/checkout`,
        {
          reservationId: null,
          transactionId: paymentIntent.id,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
  
      // 4. ✅ Now reserve the spot — payment will be found in Mongo
      await axios.post(
        `${API_URL}/api/parking/reserve`,
        { spotId, startTime, endTime },
        { headers: { Authorization: `Bearer ${token}` } }
      );
  
      navigate("/payment/success");
    } catch (err) {
      console.error("❌ Unhandled error", err);
      alert(err?.response?.data?.message || "Payment or reservation failed");
    }
  };
  
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Payment</h2>
      <p className="mb-4">
        Amount to pay: <strong>${amount}</strong>
      </p>

      <div className="border p-4 rounded mb-4">
        <CardElement options={{ hidePostalCode: true }} />
      </div>

      <button
        onClick={handleStripePayment}
        disabled={!stripe}
        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
      >
        Confirm Payment
      </button>
    </div>
  );
}

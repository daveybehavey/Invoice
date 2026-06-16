package app.notebill.app;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin {
    private static final String TAG = "PlayBilling";
    private BillingClient billingClient;
    private PluginCall pendingCall;
    private String pendingProductId = "";
    private String pendingPackageName = "";
    private String pendingProductType = BillingClient.ProductType.SUBS;
    private String pendingBasePlanId = "";
    private String pendingOfferId = "";
    private String pendingObfuscatedAccountId = "";
    private String pendingObfuscatedProfileId = "";
    private int pendingQueryAttempts = 0;

    private static final int MAX_QUERY_RETRIES = 3;
    private static final long QUERY_RETRY_DELAY_MS = 1200L;

    private void logStage(String stage, String detail) {
        Log.i(TAG, "[" + stage + "] " + detail);
    }

    private String describeBillingResult(BillingResult billingResult) {
        if (billingResult == null) {
            return "null";
        }
        String codeLabel = billingResponseCodeLabel(billingResult.getResponseCode());
        String debugMessage = normalize(billingResult.getDebugMessage());
        return "code="
                + (codeLabel.isEmpty() ? billingResult.getResponseCode() : codeLabel)
                + (debugMessage.isEmpty() ? "" : " message=" + debugMessage);
    }

    private String summarizePurchase(Purchase purchase) {
        if (purchase == null) {
            return "null";
        }
        String purchaseToken = normalize(purchase.getPurchaseToken());
        String tokenSuffix =
                purchaseToken.isEmpty()
                        ? "none"
                        : purchaseToken.substring(Math.max(0, purchaseToken.length() - 8));
        return "productId="
                + normalize(
                        purchase.getProducts() == null || purchase.getProducts().isEmpty()
                                ? pendingProductId
                                : purchase.getProducts().get(0))
                + " state="
                + purchase.getPurchaseState()
                + " acknowledged="
                + purchase.isAcknowledged()
                + " tokenSuffix="
                + tokenSuffix;
    }

    private final PurchasesUpdatedListener purchasesUpdatedListener =
            new PurchasesUpdatedListener() {
                @Override
                public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
                    logStage(
                            "purchasesUpdated",
                            describeBillingResult(billingResult)
                                    + " purchases="
                                    + (purchases == null ? 0 : purchases.size())
                                    + " pendingProductId="
                                    + pendingProductId);
                    if (pendingCall == null) {
                        logStage("purchasesUpdated", "Ignoring callback because pendingCall is null.");
                        return;
                    }

                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
                        rejectPendingCall("Google Play billing was cancelled.");
                        return;
                    }

                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        rejectPendingCall(formatBillingFailure("Google Play billing failed", billingResult));
                        return;
                    }

                    if (purchases == null || purchases.isEmpty()) {
                        rejectPendingCall("Google Play did not return a purchase.");
                        return;
                    }

                    Purchase purchase = findMatchingPurchase(purchases, pendingProductId);
                    if (purchase == null) {
                        rejectPendingCall("Google Play did not return the selected subscription.");
                        return;
                    }

                    logStage("purchasesUpdated", "Matched purchase " + summarizePurchase(purchase));

                    if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
                        rejectPendingCall("Google Play subscription purchase is pending.");
                        return;
                    }

                    if (purchase.isAcknowledged()) {
                        resolvePurchase(purchase, true);
                        return;
                    }

                    acknowledgePurchase(purchase);
                }
            };

    @Override
    public void load() {
        super.load();
        ensureBillingClient();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", isBillingAvailable());
        result.put("packageName", getContext().getPackageName());
        logStage("isAvailable", "available=" + result.getBool("available") + " packageName=" + getContext().getPackageName());
        call.resolve(result);
    }

    @PluginMethod
    public void purchaseSubscription(PluginCall call) {
        startBillingPurchase(call, BillingClient.ProductType.SUBS);
    }

    @PluginMethod
    public void purchaseOneTimeProduct(PluginCall call) {
        startBillingPurchase(call, BillingClient.ProductType.INAPP);
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        logStage("restorePurchases", "Starting restore flow.");
        ensureBillingClient();
        if (billingClient == null) {
            call.reject("Google Play billing is not available.");
            return;
        }

        if (billingClient.isReady()) {
            queryRestorablePurchases(call);
            return;
        }

        billingClient.startConnection(
                new BillingClientStateListener() {
                    @Override
                    public void onBillingSetupFinished(BillingResult billingResult) {
                        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                            logStage("restorePurchases", "Billing setup failed " + describeBillingResult(billingResult));
                            call.reject(formatBillingFailure("Unable to connect to Google Play billing", billingResult));
                            return;
                        }
                        logStage("restorePurchases", "Billing setup finished " + describeBillingResult(billingResult));
                        queryRestorablePurchases(call);
                    }

                    @Override
                    public void onBillingServiceDisconnected() {
                        // The next restore or purchase request will reconnect automatically.
                    }
                });
    }

    private void startBillingPurchase(PluginCall call, String productType) {
        if (pendingCall != null) {
            call.reject("Another Google Play billing flow is already running.");
            return;
        }

        String productId = normalize(call.getString("productId"));
        if (productId.isEmpty()) {
            call.reject("Missing productId.");
            return;
        }

        pendingCall = call;
        pendingProductId = productId;
        pendingPackageName = normalize(call.getString("packageName"));
        pendingProductType = productType;
        pendingBasePlanId = normalize(call.getString("basePlanId"));
        pendingOfferId = normalize(call.getString("offerId"));
        pendingObfuscatedAccountId = normalize(call.getString("obfuscatedAccountId"));
        pendingObfuscatedProfileId = normalize(call.getString("obfuscatedProfileId"));
        pendingQueryAttempts = 0;
        logStage(
                "startPurchase",
                "productType="
                        + productType
                        + " productId="
                        + pendingProductId
                        + " basePlanId="
                        + pendingBasePlanId
                        + " offerId="
                        + pendingOfferId
                        + " hasAccountId="
                        + !pendingObfuscatedAccountId.isEmpty()
                        + " hasProfileId="
                        + !pendingObfuscatedProfileId.isEmpty());

        ensureBillingClient();
        if (billingClient == null) {
            rejectPendingCall("Google Play billing is not available.");
            return;
        }

        if (billingClient.isReady()) {
            queryAndLaunchPurchase();
            return;
        }

        billingClient.startConnection(
                new BillingClientStateListener() {
                    @Override
                    public void onBillingSetupFinished(BillingResult billingResult) {
                        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                            logStage("startPurchase", "Billing setup failed " + describeBillingResult(billingResult));
                            rejectPendingCall(formatBillingFailure("Unable to connect to Google Play billing", billingResult));
                            return;
                        }
                        logStage("startPurchase", "Billing setup finished " + describeBillingResult(billingResult));
                        queryAndLaunchPurchase();
                    }

                    @Override
                    public void onBillingServiceDisconnected() {
                        // The next purchase request will reconnect automatically.
                    }
                });
    }

    private void queryRestorablePurchases(PluginCall call) {
        if (billingClient == null) {
            call.reject("Google Play billing is not available.");
            return;
        }
        logStage("queryRestorablePurchases", "Querying subscriptions and one-time products.");
        JSArray purchases = new JSArray();
        queryPurchasesForType(
                BillingClient.ProductType.SUBS,
                purchases,
                () ->
                        queryPurchasesForType(
                                BillingClient.ProductType.INAPP,
                                purchases,
                                () -> {
                                    try {
                                        JSObject result = new JSObject();
                                        result.put("purchases", purchases);
                                        result.put("packageName", getContext().getPackageName());
                                        final int purchaseCount = purchases.length();
                                        logStage("queryRestorablePurchases", "Resolving restore with purchases=" + purchaseCount);
                                        new Handler(Looper.getMainLooper())
                                                .post(
                                                        () -> {
                                                            logStage("queryRestorablePurchases", "Dispatching restore result to JS bridge.");
                                                            call.resolve(result);
                                                        });
                                    } catch (Exception error) {
                                        logStage("queryRestorablePurchases", "Restore resolution failed " + error);
                                        call.reject("Unable to package restored Google Play purchases.");
                                    }
                                },
                                call),
                call);
    }

    private void queryPurchasesForType(String productType, JSArray purchases, Runnable onComplete, PluginCall call) {
        queryPurchasesForType(productType, purchases, onComplete, call, 0);
    }

    private void queryPurchasesForType(String productType, JSArray purchases, Runnable onComplete, PluginCall call, int attempt) {
        if (billingClient == null) {
            call.reject("Google Play billing is not available.");
            return;
        }
        logStage("queryPurchasesForType", "productType=" + productType + " attempt=" + attempt);
        QueryPurchasesParams params =
                QueryPurchasesParams.newBuilder()
                        .setProductType(productType)
                        .build();
        billingClient.queryPurchasesAsync(
                params,
                (billingResult, purchaseList) -> {
                    logStage(
                            "queryPurchasesForType",
                            "productType="
                                    + productType
                                    + " "
                                    + describeBillingResult(billingResult)
                                    + " purchases="
                                    + (purchaseList == null ? 0 : purchaseList.size()));
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        if (attempt < MAX_QUERY_RETRIES && shouldRetryBillingQuery(billingResult)) {
                            new Handler(Looper.getMainLooper())
                                    .postDelayed(
                                            () -> {
                                                if (call != null) {
                                                    queryPurchasesForType(productType, purchases, onComplete, call, attempt + 1);
                                                }
                                            },
                                            QUERY_RETRY_DELAY_MS);
                            return;
                        }
                        call.reject(formatBillingFailure("Unable to restore Google Play purchases", billingResult));
                        return;
                    }
                    if (purchaseList != null) {
                        for (Purchase purchase : purchaseList) {
                            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                                try {
                                    logStage("queryPurchasesForType", "Restorable purchase " + summarizePurchase(purchase));
                                    purchases.put(toPurchaseObject(purchase, productType));
                                } catch (Exception error) {
                                    logStage("queryPurchasesForType", "Failed to serialize purchase " + error);
                                    call.reject("Unable to prepare restored Google Play purchase details.");
                                    return;
                                }
                            }
                        }
                    }
                    try {
                        logStage("queryPurchasesForType", "Completed productType=" + productType + " purchasesSoFar=" + purchases.length());
                        onComplete.run();
                    } catch (Exception error) {
                        logStage("queryPurchasesForType", "Completion failed " + error);
                        call.reject("Unable to finish Google Play restore.");
                    }
                });
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (billingClient != null) {
            billingClient.endConnection();
            billingClient = null;
        }
    }

    private void ensureBillingClient() {
        if (billingClient != null) {
            return;
        }
        billingClient =
                BillingClient.newBuilder(getContext())
                        .setListener(purchasesUpdatedListener)
                        .enablePendingPurchases(
                                PendingPurchasesParams.newBuilder()
                                        .enableOneTimeProducts()
                                        .enablePrepaidPlans()
                                        .build())
                        .build();
    }

    private boolean isBillingAvailable() {
        ensureBillingClient();
        return billingClient != null && billingClient.isFeatureSupported(BillingClient.FeatureType.SUBSCRIPTIONS).getResponseCode() == BillingClient.BillingResponseCode.OK;
    }

    private void queryAndLaunchPurchase() {
        queryAndLaunchPurchaseAttempt();
    }

    private void queryAndLaunchPurchaseAttempt() {
        if (billingClient == null || pendingCall == null) {
            return;
        }
        logStage(
                "queryAndLaunchPurchase",
                "attempt=" + pendingQueryAttempts + " productId=" + pendingProductId + " productType=" + pendingProductType);
        QueryProductDetailsParams.Product product =
                QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(pendingProductId)
                        .setProductType(pendingProductType)
                        .build();
        QueryProductDetailsParams params =
                QueryProductDetailsParams.newBuilder()
                        .setProductList(Collections.singletonList(product))
                        .build();

        billingClient.queryProductDetailsAsync(
                params,
                (billingResult, queryProductDetailsResult) -> {
                    if (pendingCall == null) {
                        return;
                    }
                    logStage(
                            "queryProductDetails",
                            describeBillingResult(billingResult)
                                    + " pendingProductId="
                                    + pendingProductId
                                    + " count="
                                    + (queryProductDetailsResult == null || queryProductDetailsResult.getProductDetailsList() == null
                                            ? 0
                                            : queryProductDetailsResult.getProductDetailsList().size()));
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        if (pendingQueryAttempts < MAX_QUERY_RETRIES && shouldRetryBillingQuery(billingResult)) {
                            schedulePurchaseQueryRetry();
                            return;
                        }
                        rejectPendingCall(formatBillingFailure("Unable to load Google Play subscription details", billingResult));
                        return;
                    }
                    List<ProductDetails> productDetailsList =
                            queryProductDetailsResult == null
                                    ? Collections.emptyList()
                                    : queryProductDetailsResult.getProductDetailsList();
                    if (productDetailsList == null || productDetailsList.isEmpty()) {
                        rejectPendingCall("Google Play product was not found.");
                        return;
                    }

                    ProductDetails details = productDetailsList.get(0);
                    Activity activity = getActivity();
                    if (activity == null) {
                        rejectPendingCall("The Android billing activity is not available.");
                        return;
                    }

                    BillingFlowParams.ProductDetailsParams.Builder productParamsBuilder =
                            BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details);
                    String offerToken = selectOfferToken(details, pendingProductType, pendingBasePlanId, pendingOfferId);
                    if (!offerToken.isEmpty()) {
                        productParamsBuilder.setOfferToken(offerToken);
                    }
                    BillingFlowParams flowParams = buildBillingFlowParams(productParamsBuilder.build());

                    BillingResult launchResult = billingClient.launchBillingFlow(activity, flowParams);
                    logStage("launchBillingFlow", describeBillingResult(launchResult) + " productId=" + pendingProductId);
                    if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        if (pendingQueryAttempts < MAX_QUERY_RETRIES && shouldRetryBillingQuery(launchResult)) {
                            schedulePurchaseQueryRetry();
                            return;
                        }
                        rejectPendingCall(formatBillingFailure("Unable to start Google Play purchase", launchResult));
                    }
                });
    }

    private void schedulePurchaseQueryRetry() {
        if (pendingCall == null) {
            return;
        }
        pendingQueryAttempts += 1;
        logStage("scheduleRetry", "attempt=" + pendingQueryAttempts + " productId=" + pendingProductId);
        new Handler(Looper.getMainLooper())
                .postDelayed(
                        () -> {
                            if (pendingCall != null) {
                                queryAndLaunchPurchaseAttempt();
                            }
                        },
                        QUERY_RETRY_DELAY_MS);
    }

    private String selectOfferToken(ProductDetails details, String productType, String basePlanId, String offerId) {
        if (BillingClient.ProductType.INAPP.equals(productType)) {
            if (details.getOneTimePurchaseOfferDetailsList() == null
                    || details.getOneTimePurchaseOfferDetailsList().isEmpty()) {
                return "";
            }
            for (ProductDetails.OneTimePurchaseOfferDetails offer : details.getOneTimePurchaseOfferDetailsList()) {
                String offerToken = normalize(offer.getOfferToken());
                if (!offerToken.isEmpty()) {
                    return offerToken;
                }
            }
            return normalize(details.getOneTimePurchaseOfferDetailsList().get(0).getOfferToken());
        }

        if (details.getSubscriptionOfferDetails() == null || details.getSubscriptionOfferDetails().isEmpty()) {
            return "";
        }
        if (!offerId.isEmpty()) {
            for (ProductDetails.SubscriptionOfferDetails offer : details.getSubscriptionOfferDetails()) {
                String currentOfferId = normalize(offer.getOfferId());
                if (offerId.equals(currentOfferId)) {
                    String matchingOfferToken = normalize(offer.getOfferToken());
                    if (!matchingOfferToken.isEmpty()) {
                        return matchingOfferToken;
                    }
                }
            }
        }
        if (!basePlanId.isEmpty()) {
            for (ProductDetails.SubscriptionOfferDetails offer : details.getSubscriptionOfferDetails()) {
                String currentBasePlanId = normalize(offer.getBasePlanId());
                if (basePlanId.equals(currentBasePlanId)) {
                    String matchingOfferToken = normalize(offer.getOfferToken());
                    if (!matchingOfferToken.isEmpty()) {
                        return matchingOfferToken;
                    }
                }
            }
        }
        for (ProductDetails.SubscriptionOfferDetails offer : details.getSubscriptionOfferDetails()) {
            String offerToken = normalize(offer.getOfferToken());
            if (!offerToken.isEmpty()) {
                return offerToken;
            }
        }
        return normalize(details.getSubscriptionOfferDetails().get(0).getOfferToken());
    }

    private BillingFlowParams buildBillingFlowParams(BillingFlowParams.ProductDetailsParams productDetailsParams) {
        BillingFlowParams.Builder builder =
                BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(Collections.singletonList(productDetailsParams));
        if (!pendingObfuscatedAccountId.isEmpty()) {
            builder.setObfuscatedAccountId(pendingObfuscatedAccountId);
        }
        if (!pendingObfuscatedProfileId.isEmpty()) {
            builder.setObfuscatedProfileId(pendingObfuscatedProfileId);
        }
        return builder.build();
    }

    private Purchase findMatchingPurchase(List<Purchase> purchases, String productId) {
        for (Purchase purchase : purchases) {
            if (purchase.getProducts() != null && purchase.getProducts().contains(productId)) {
                return purchase;
            }
        }
        return purchases.isEmpty() ? null : purchases.get(0);
    }

    private void acknowledgePurchase(Purchase purchase) {
        if (billingClient == null) {
            rejectPendingCall("Google Play billing is not available.");
            return;
        }
        logStage("acknowledgePurchase", summarizePurchase(purchase));
        AcknowledgePurchaseParams params =
                AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(purchase.getPurchaseToken())
                        .build();
        billingClient.acknowledgePurchase(
                params,
                billingResult -> {
                    if (pendingCall == null) {
                        return;
                    }
                    logStage("acknowledgePurchase", describeBillingResult(billingResult));
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        rejectPendingCall(formatBillingFailure("Google Play purchase acknowledgement failed", billingResult));
                        return;
                    }
                    resolvePurchase(purchase, true);
                });
    }

    private void resolvePurchase(Purchase purchase, boolean acknowledged) {
        if (pendingCall == null) {
            return;
        }
        logStage("resolvePurchase", summarizePurchase(purchase) + " resolvedAcknowledged=" + acknowledged);
        JSObject result = toPurchaseObject(purchase, pendingProductType);
        result.put("productId", normalize(purchase.getProducts() == null || purchase.getProducts().isEmpty() ? pendingProductId : purchase.getProducts().get(0)));
        result.put("packageName", normalize(pendingPackageName.isEmpty() ? getContext().getPackageName() : pendingPackageName));
        result.put("acknowledged", acknowledged || purchase.isAcknowledged());
        pendingCall.resolve(result);
        clearPendingCall();
    }

    private JSObject toPurchaseObject(Purchase purchase, String productType) {
        JSObject result = new JSObject();
        result.put("purchaseToken", normalize(purchase.getPurchaseToken()));
        result.put("productId", normalize(purchase.getProducts() == null || purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0)));
        result.put("packageName", getContext().getPackageName());
        result.put("productType", BillingClient.ProductType.INAPP.equals(productType) ? "one_time" : "subscription");
        result.put("purchaseState", purchase.getPurchaseState());
        result.put("acknowledged", purchase.isAcknowledged());
        result.put("orderId", normalize(purchase.getOrderId()));
        return result;
    }

    private void rejectPendingCall(String message) {
        if (pendingCall != null) {
            Log.w(TAG, message);
            pendingCall.reject(message);
        }
        logStage("rejectPendingCall", message);
        clearPendingCall();
    }

    private String formatBillingFailure(String prefix, BillingResult billingResult) {
        if (billingResult == null) {
            return prefix + ".";
        }
        String debugMessage = normalize(billingResult.getDebugMessage());
        String codeLabel = billingResponseCodeLabel(billingResult.getResponseCode());
        String codeValue = codeLabel.isEmpty() ? String.valueOf(billingResult.getResponseCode()) : codeLabel;
        if (debugMessage.isEmpty()) {
            return prefix + " (code " + codeValue + ").";
        }
        return prefix + " (code " + codeValue + "): " + debugMessage + ".";
    }

    private String billingResponseCodeLabel(int responseCode) {
        switch (responseCode) {
            case BillingClient.BillingResponseCode.OK:
                return "OK";
            case BillingClient.BillingResponseCode.USER_CANCELED:
                return "USER_CANCELED";
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE:
                return "SERVICE_UNAVAILABLE";
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE:
                return "BILLING_UNAVAILABLE";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE:
                return "ITEM_UNAVAILABLE";
            case BillingClient.BillingResponseCode.DEVELOPER_ERROR:
                return "DEVELOPER_ERROR";
            case BillingClient.BillingResponseCode.ERROR:
                return "ERROR";
            case BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED:
                return "ITEM_ALREADY_OWNED";
            case BillingClient.BillingResponseCode.ITEM_NOT_OWNED:
                return "ITEM_NOT_OWNED";
            case BillingClient.BillingResponseCode.NETWORK_ERROR:
                return "NETWORK_ERROR";
            case BillingClient.BillingResponseCode.SERVICE_DISCONNECTED:
                return "SERVICE_DISCONNECTED";
            case BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED:
                return "FEATURE_NOT_SUPPORTED";
            case BillingClient.BillingResponseCode.SERVICE_TIMEOUT:
                return "SERVICE_TIMEOUT";
            default:
                return "";
        }
    }

    private void clearPendingCall() {
        logStage("clearPendingCall", "productId=" + pendingProductId + " productType=" + pendingProductType);
        pendingCall = null;
        pendingProductId = "";
        pendingPackageName = "";
        pendingProductType = BillingClient.ProductType.SUBS;
        pendingBasePlanId = "";
        pendingOfferId = "";
        pendingQueryAttempts = 0;
    }

    private boolean shouldRetryBillingQuery(BillingResult billingResult) {
        if (billingResult == null) {
            return false;
        }
        int responseCode = billingResult.getResponseCode();
        return responseCode == BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE
                || responseCode == BillingClient.BillingResponseCode.SERVICE_DISCONNECTED
                || responseCode == BillingClient.BillingResponseCode.SERVICE_TIMEOUT
                || responseCode == BillingClient.BillingResponseCode.ERROR;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}

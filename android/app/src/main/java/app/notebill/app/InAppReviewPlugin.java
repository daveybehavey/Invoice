package app.notebill.app;

import android.app.Activity;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

@CapacitorPlugin(name = "InAppReview")
public class InAppReviewPlugin extends Plugin {
    private static final String TAG = "InAppReview";

    @PluginMethod
    public void requestReview(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("The Android activity is not available.");
            return;
        }

        ReviewManager reviewManager = ReviewManagerFactory.create(activity);
        Task<ReviewInfo> requestTask = reviewManager.requestReviewFlow();
        requestTask.addOnCompleteListener(
                activity,
                task -> {
                    if (!task.isSuccessful()) {
                        Exception error = task.getException();
                        Log.w(TAG, "Review flow request failed", error);
                        JSObject result = new JSObject();
                        result.put("attempted", false);
                        result.put("flowFinished", false);
                        result.put("message", error == null ? "review_unavailable" : safeMessage(error.getMessage()));
                        call.resolve(result);
                        return;
                    }

                    ReviewInfo reviewInfo = task.getResult();
                    Task<Void> launchTask = reviewManager.launchReviewFlow(activity, reviewInfo);
                    launchTask.addOnCompleteListener(
                            activity,
                            flowTask -> {
                                JSObject result = new JSObject();
                                result.put("attempted", true);
                                result.put("flowFinished", true);
                                result.put("message", "review_flow_finished");
                                call.resolve(result);
                            });
                });
    }

    private String safeMessage(String message) {
        return message == null || message.trim().isEmpty() ? "review_unavailable" : message.trim();
    }
}

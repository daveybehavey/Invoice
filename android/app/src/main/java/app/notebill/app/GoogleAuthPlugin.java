package app.notebill.app;

import android.app.Activity;
import android.os.CancellationSignal;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {
    private CredentialManager credentialManager;

    @Override
    public void load() {
        super.load();
        credentialManager = CredentialManager.create(getContext());
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("The Android activity is not available.");
            return;
        }

        String serverClientId = normalize(call.getString("serverClientId"));
        if (serverClientId.isEmpty()) {
            call.reject("Missing serverClientId.");
            return;
        }

        try {
            if (credentialManager == null) {
                credentialManager = CredentialManager.create(getContext());
            }
            GetSignInWithGoogleOption googleIdOption =
                    new GetSignInWithGoogleOption.Builder(serverClientId).build();
            GetCredentialRequest request =
                    new GetCredentialRequest.Builder().addCredentialOption(googleIdOption).build();

            credentialManager.getCredentialAsync(
                    activity,
                    request,
                    new CancellationSignal(),
                    ContextCompat.getMainExecutor(activity),
                    new androidx.credentials.CredentialManagerCallback<
                            GetCredentialResponse, GetCredentialException>() {
                        @Override
                        public void onResult(GetCredentialResponse response) {
                            try {
                                resolveCredential(call, response);
                            } catch (RuntimeException error) {
                                call.reject(
                                        error.getMessage() == null || error.getMessage().isEmpty()
                                                ? "Google Sign-In failed."
                                                : error.getMessage());
                            }
                        }

                        @Override
                        public void onError(GetCredentialException error) {
                            call.reject(formatGoogleSignInException(error));
                        }
                    });
        } catch (RuntimeException error) {
            call.reject(formatGoogleSignInError(error.getMessage()));
        }
    }

    private void resolveCredential(PluginCall call, GetCredentialResponse response) {
        Credential credential = response.getCredential();
        if (!(credential instanceof CustomCredential)) {
            call.reject("Google Sign-In did not return a Google credential.");
            return;
        }

        CustomCredential customCredential = (CustomCredential) credential;
        if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(customCredential.getType())) {
            call.reject("Google Sign-In returned an unexpected credential type.");
            return;
        }

        GoogleIdTokenCredential googleCredential =
                GoogleIdTokenCredential.createFrom(customCredential.getData());
        JSObject result = new JSObject();
        result.put("idToken", normalize(googleCredential.getIdToken()));
        result.put("email", normalize(googleCredential.getId()));
        result.put("displayName", normalizeNullable(googleCredential.getDisplayName()));
        result.put("givenName", normalizeNullable(googleCredential.getGivenName()));
        result.put("familyName", normalizeNullable(googleCredential.getFamilyName()));
        result.put(
                "profilePictureUrl",
                googleCredential.getProfilePictureUri() == null
                        ? ""
                        : normalize(googleCredential.getProfilePictureUri().toString()));
        call.resolve(result);
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private String normalizeNullable(String value) {
        return value == null ? "" : value.trim();
    }

    private String formatGoogleSignInError(String message) {
        String normalized = normalize(message);
        String lower = normalized.toLowerCase();
        if (lower.contains("developer console is not set up correctly")
                || lower.contains("developer_error")
                || lower.contains("10:")) {
            return "Google Sign-In is not fully linked to this Android build yet. Add an Android OAuth client in Google Cloud Console for package app.notebill.app using the Play app-signing SHA-1 certificate, then try again.";
        }
        return normalized.isEmpty() ? "Google Sign-In failed." : normalized;
    }

    private String formatGoogleSignInException(GetCredentialException error) {
        if (error == null) {
            return "Google Sign-In failed.";
        }

        String message = normalize(error.getMessage());
        String className = error.getClass().getSimpleName();
        String combined = message.isEmpty() ? className : className + ": " + message;
        String formatted = formatGoogleSignInError(combined);

        if (error instanceof GetCredentialCancellationException) {
            String lower = combined.toLowerCase();
            if (lower.contains("activity is cancelled by the user")
                    || lower.contains("canceled by the user")) {
                return "Google Sign-In was cancelled before Google returned a token. If you picked an account and still saw this, Google Play services may still be catching up to the new OAuth setup. Wait a few minutes, reinstall the latest test build, and try again.";
            }
        }

        return formatted;
    }
}

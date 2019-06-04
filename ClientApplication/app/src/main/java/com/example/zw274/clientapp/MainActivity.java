package com.example.zw274.clientapp;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.hardware.Camera;
import android.hardware.camera2.CameraCharacteristics;
import android.os.Bundle;
import android.os.Environment;
import android.support.v4.app.ActivityCompat;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.view.MotionEvent;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.widget.Toast;
import android.widget.Toolbar;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.ChecksumException;
import com.google.zxing.FormatException;
import com.google.zxing.LuminanceSource;
import com.google.zxing.NotFoundException;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Reader;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;

import org.opencv.android.BaseLoaderCallback;
import org.opencv.android.CameraBridgeViewBase.CvCameraViewFrame;
import org.opencv.android.CameraBridgeViewBase.CvCameraViewListener2;
import org.opencv.android.LoaderCallbackInterface;
import org.opencv.android.OpenCVLoader;
import org.opencv.android.Utils;
import org.opencv.core.Core;
import org.opencv.core.CvType;
import org.opencv.core.Mat;
import org.opencv.core.Point;
import org.opencv.core.Scalar;
import org.opencv.core.Size;
import org.opencv.imgcodecs.Imgcodecs;
import org.opencv.imgproc.Imgproc;
import org.opencv.imgproc.Moments;
import org.opencv.photo.Photo;
import org.opencv.ximgproc.SuperpixelLSC;
import org.opencv.ximgproc.SuperpixelSLIC;
import org.opencv.ximgproc.Ximgproc;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.lang.reflect.Array;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.ListIterator;
import java.util.Scanner;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity implements CvCameraViewListener2, View.OnTouchListener {

    // Storage Permissions
    private static final int REQUEST_EXTERNAL_STORAGE = 1;
    private static String[] PERMISSIONS_STORAGE = {
            Manifest.permission.READ_EXTERNAL_STORAGE,
            Manifest.permission.WRITE_EXTERNAL_STORAGE
    };
    public static void verifyStoragePermissions(Activity activity) {
        // Check if we have write permission
        int read_permission = ActivityCompat.checkSelfPermission(activity, Manifest.permission.READ_EXTERNAL_STORAGE);
        int write_permission = ActivityCompat.checkSelfPermission(activity, Manifest.permission.WRITE_EXTERNAL_STORAGE);
        if (read_permission != PackageManager.PERMISSION_GRANTED || write_permission != PackageManager.PERMISSION_GRANTED) {
            // We don't have permission so prompt the user
            ActivityCompat.requestPermissions(
                    activity,
                    PERMISSIONS_STORAGE,
                    REQUEST_EXTERNAL_STORAGE
            );
        }
    }

    private static final String TAG = "MainActivity";
    private static final int res_width = 1600;
    private static final int res_height = 1200;
    private static final int res_low_width = 640;
    private static final int res_low_height = 480;
    private static final float calibration_error_threshold = 5 * res_width / res_low_width;

    private MainView mOpenCvCameraView;
    private MenuItem mAuthorMenu;
    private MenuItem mViewerMenu;
    private MenuItem mAnimationMenu;
    private int mCurrMode; // 0: author, 1: viewer, 2: animation
    private Toolbar mToolbar;

    private Mat mRgba;
    private Mat mLoadedMat;
    private Mat mAnimatedMat;
    private List<Mat> mLoadedMasks;
    private boolean mIsPictureTaken;
    private boolean mIsQREverDetected;
    private boolean mIsPictureLoaded;
    private int mCurrKeyFrame;
    private int mCurrFrame;
    private float[] mLandmarks; // Ground truth landmarks stored in QR code: x0, y0, x1, y1, x2, y2, x3, y3
    private float[] mDetectedLandmarks; // Real time detected landmarks: x0, y0, x1, y1, x2, y2, x3, y3
    private int[] mQRCodeBox; // rowStart, rowEnd, colStart, colEnd
    private float mLSCparam0, mLSCparam1, mLSCparam2, mLSCparam3;

    private String mDecodedString;
    private List<Keyframe> mKeyframes;

    // Store temporary results to generate annotatiom image only once
    private Mat mCachedAnnotation;
    private int mPrevKeyFrame;

    // Store temporary results to generate 2D transformation image only once
    private Mat mROI;
    private Mat mInpainted;
    private Mat mDilatedMask;
    private boolean mIsInpainted;
    private double mCenterX;
    private double mCenterY;

    private BaseLoaderCallback mLoaderCallback = new BaseLoaderCallback(this) {
        @Override
        public void onManagerConnected(int status) {
            switch (status) {
                case LoaderCallbackInterface.SUCCESS:
                {
                    Log.i(TAG, "OpenCV loaded successfully");
                    mOpenCvCameraView.enableView();
                    // Touch the screen to take a picture
                    mOpenCvCameraView.setOnTouchListener(MainActivity.this);
                } break;
                default:
                {
                    super.onManagerConnected(status);
                } break;
            }
        }
    };

    public MainActivity() {
        Log.i(TAG, "Instantiated new " + this.getClass());
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.i(TAG, "called onCreate");
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_main);
        mOpenCvCameraView = (MainView) findViewById(R.id.java_camera_view);
        mOpenCvCameraView.setVisibility(SurfaceView.VISIBLE);
        mOpenCvCameraView.setCvCameraViewListener(this);
        verifyStoragePermissions(this);
    }

    @Override
    public void onPause()
    {
        super.onPause();
        if (mOpenCvCameraView != null)
            mOpenCvCameraView.disableView();
    }

    @Override
    public void onResume()
    {
        super.onResume();
        if (!OpenCVLoader.initDebug()) {
            Log.e(TAG, "Internal OpenCV library not found. Using OpenCV Manager for initialization");
            OpenCVLoader.initAsync(OpenCVLoader.OPENCV_VERSION_3_0_0, this, mLoaderCallback);
        } else {
            Log.i(TAG, "OpenCV library found inside package. Using it!");
            mLoaderCallback.onManagerConnected(LoaderCallbackInterface.SUCCESS);
        }
    }

    public void onDestroy() {
        super.onDestroy();
        if (mOpenCvCameraView != null)
            mOpenCvCameraView.disableView();
    }

    public void onCameraViewStarted(int width, int height) {
        // Initialize the resolution as 1600x1200
        // On Huawei Mate 7: mOpenCvCameraView.getResolutionList().get(4) is 640x480
        // On Huawei Mate 7: mOpenCvCameraView.getResolutionList().get(7) is 960x720
        // On Samsung S8: mOpenCvCameraView.getResolutionList().get(1) is 1440x1080
        // On Pixel 2 XL: mOpenCvCameraView.getResolutionList().get(1) is 1600x1200
        Camera.Size resolution = mOpenCvCameraView.getResolutionList().get(1);
//        Log.e(TAG, "RES: "+ resolution.height + " " + resolution.width);
//        for (int i = 0; i < mOpenCvCameraView.getResolutionList().size(); i++) {
//            Log.e(TAG, "List " + i + ": " + mOpenCvCameraView.getResolutionList().get(i).height + " " + mOpenCvCameraView.getResolutionList().get(i).width);
//        }
        mOpenCvCameraView.setResolution(resolution);

        mCurrMode = 1;

        mRgba = new Mat(res_height, res_width, CvType.CV_8UC4);
        mLoadedMat = new Mat(res_low_height, res_low_width, CvType.CV_8UC4);
        mAnimatedMat = new Mat(res_height, res_width, CvType.CV_8UC4);
        mLoadedMasks = new ArrayList<Mat>();

        mIsPictureTaken = false;
        mIsQREverDetected = false;
        mIsPictureLoaded = false;
        mCurrKeyFrame = 0;
        mCurrFrame = 0;

        mLandmarks = new float[8];
        mDetectedLandmarks = new float[8];
        mQRCodeBox = new int[4];
        mQRCodeBox[0] = 0; mQRCodeBox[1] = res_height; // rowStart, rowEnd
        mQRCodeBox[2] = 0; mQRCodeBox[3] = res_width; // colStart, colEnd

        mDecodedString = new String("");
        mKeyframes = new ArrayList<Keyframe>();
        mCachedAnnotation = new Mat();
        mPrevKeyFrame = -1;

        mROI = new Mat();
        mInpainted = new Mat();
        mDilatedMask = new Mat();
        mIsInpainted = false;
        mCenterX = 0;
        mCenterY = 0;
    }

    public void onCameraViewStopped() {
        mRgba.release();
        mLoadedMat.release();
        mAnimatedMat.release();
        for (int i = 0; i < mLoadedMasks.size(); i++) {
            mLoadedMasks.get(i).release();
        }
        mLoadedMasks.clear();

        mDecodedString = "";
        mKeyframes.clear();
        mCachedAnnotation.release();

        mROI.release();
        mDilatedMask.release();
        mInpainted.release();
    }

    public Result zxing() throws ChecksumException, FormatException {
        // If QR code ever detected, update a smaller window for further detection and calibration for better efficiency
        if (mIsQREverDetected) {
            // Note the row/col and x/y order: mLandmarks[odd] are rows, mLandmarks[even] are cols
            mQRCodeBox[0] = Math.max(mQRCodeBox[0], (int) Math.min(Math.min(mLandmarks[1], mLandmarks[3]), Math.min(mLandmarks[5], mLandmarks[7])) - 100);
            mQRCodeBox[1] = Math.min(mQRCodeBox[1], (int) Math.max(Math.max(mLandmarks[1], mLandmarks[3]), Math.max(mLandmarks[5], mLandmarks[7])) + 100);
            mQRCodeBox[2] = Math.max(mQRCodeBox[2], (int) Math.min(Math.min(mLandmarks[0], mLandmarks[2]), Math.min(mLandmarks[4], mLandmarks[6])) - 100);
            mQRCodeBox[3] = Math.min(mQRCodeBox[3], (int) Math.max(Math.max(mLandmarks[0], mLandmarks[2]), Math.max(mLandmarks[4], mLandmarks[6])) + 100);
//            Log.i(TAG, "rowStart: " + String.valueOf(mQRCodeBox[0]));
//            Log.i(TAG, "rowEnd: " + String.valueOf(mQRCodeBox[1]));
//            Log.i(TAG, "colStart: " + String.valueOf(mQRCodeBox[2]));
//            Log.i(TAG, "colEnd: " + String.valueOf(mQRCodeBox[3]));
        }
        Bitmap bMap = Bitmap.createBitmap(mQRCodeBox[3] - mQRCodeBox[2], mQRCodeBox[1] - mQRCodeBox[0], Bitmap.Config.ARGB_8888); // width, height
        Utils.matToBitmap(mRgba.submat(mQRCodeBox[0], mQRCodeBox[1], mQRCodeBox[2], mQRCodeBox[3]), bMap);
        int[] intArray = new int[bMap.getWidth() * bMap.getHeight()];
        // Copy pixel data from the Bitmap into the 'intArray' array
        bMap.getPixels(intArray, 0, bMap.getWidth(), 0, 0, bMap.getWidth(), bMap.getHeight());
        LuminanceSource source = new RGBLuminanceSource(bMap.getWidth(), bMap.getHeight(),intArray);
        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(source));
        Reader reader = new QRCodeReader();
//        Hashtable<DecodeHintType, Object> hints = new Hashtable<DecodeHintType, Object>();
//        hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
//        hints.put(DecodeHintType.PURE_BARCODE, Boolean.TRUE);
        try {
            return reader.decode(bitmap);
        }
        catch (NotFoundException e) {
            Log.e(TAG, "Code Not Found");
            e.printStackTrace();
        }
        return null;
    }

    public Mat onCameraFrame(CvCameraViewFrame inputFrame) {
        mRgba = inputFrame.rgba();
        if (mCurrMode == 0) { // Author mode
            return mRgba;
        } else if (mCurrMode == 1) { // Viewer mode
            // Wait for a picture to be taken
            if (mIsPictureTaken) {
                // Reset all states
                mIsPictureTaken = false;
                mIsQREverDetected = false;
                mPrevKeyFrame = -1;
                mCurrKeyFrame = 0;
                mCurrFrame = 0;
                mQRCodeBox[0] = 0; mQRCodeBox[1] = res_height; // rowStart, rowEnd
                mQRCodeBox[2] = 0; mQRCodeBox[3] = res_width; // colStart, colEnd

                // Start animation
                mCurrMode = 2;
            } else {
                try {
                    // Make sure that no circles are drawn before QR code detection
                    Result result = zxing();
                    if (result != null) {
                        Log.i(TAG, "Found something: " + result.getText());
                        mDecodedString = result.getText();
                        Scanner sc = new Scanner(mDecodedString);
                        if (!mIsQREverDetected) {
                            for (int i = 0; i < 8; i++) {
                                if (sc.hasNextFloat()) {
                                    mLandmarks[i] = sc.nextFloat() * res_height / (float) res_low_height;
                                }
                            }
                            if (sc.hasNextFloat()) {
                                mLSCparam0 = sc.nextFloat();
                            }
                            if (sc.hasNextFloat()) {
                                mLSCparam1 = sc.nextFloat();
                            }
                            if (sc.hasNextFloat()) {
                                mLSCparam2 = sc.nextFloat();
                            }
                            if (sc.hasNextFloat()) {
                                mLSCparam3 = sc.nextFloat();
                            }
                        }
                        sc.close();
                        mIsQREverDetected = true;

                        // Write decoded QR information to file
                        File fileNameQRText = new File(Environment.getExternalStorageDirectory().getPath() +
                                "/AnimationProject/", "qr_decoded.txt");
                        try {
                            fileNameQRText.createNewFile();
                            FileOutputStream fout = new FileOutputStream(fileNameQRText);
                            OutputStreamWriter outWriter = new OutputStreamWriter(fout);
                            outWriter.append(mDecodedString);
                            outWriter.close();
                            fout.flush();
                            fout.close();
                        }
                        catch (IOException e) {
                            Log.e("Exception", "File write failed: " + e.toString());
                        }

                        // Draw QR code landmarks
                        if (result.getResultPoints().length == 4) {
                            mDetectedLandmarks[0] = mQRCodeBox[2] + result.getResultPoints()[0].getX();
                            mDetectedLandmarks[1] = mQRCodeBox[0] + result.getResultPoints()[0].getY();
                            mDetectedLandmarks[2] = mQRCodeBox[2] + result.getResultPoints()[1].getX();
                            mDetectedLandmarks[3] = mQRCodeBox[0] + result.getResultPoints()[1].getY();
                            mDetectedLandmarks[4] = mQRCodeBox[2] + result.getResultPoints()[2].getX();
                            mDetectedLandmarks[5] = mQRCodeBox[0] + result.getResultPoints()[2].getY();
                            mDetectedLandmarks[6] = mQRCodeBox[2] + result.getResultPoints()[3].getX();
                            mDetectedLandmarks[7] = mQRCodeBox[0] + result.getResultPoints()[3].getY();

                            Mat backupRgba = mRgba.clone();
                            Imgproc.circle(mRgba, new Point(mDetectedLandmarks[0], mDetectedLandmarks[1]), 10, new Scalar(0, 255, 0), -1);
                            Imgproc.circle(mRgba, new Point(mDetectedLandmarks[2], mDetectedLandmarks[3]), 10, new Scalar(0, 255, 0), -1);
                            Imgproc.circle(mRgba, new Point(mDetectedLandmarks[4], mDetectedLandmarks[5]), 10, new Scalar(0, 255, 0), -1);
                            Imgproc.circle(mRgba, new Point(mDetectedLandmarks[6], mDetectedLandmarks[7]), 10, new Scalar(0, 255, 0), -1);
                            float calibration_error = 0;
                            for (int i = 0; i < 8; i++) {
                                calibration_error += (mLandmarks[i] - mDetectedLandmarks[i]) * (mLandmarks[i] - mDetectedLandmarks[i]);
                            }
                            calibration_error = (float) Math.sqrt(calibration_error);
                            Log.i(TAG, "Calibration error: " + String.valueOf(calibration_error));

                            if (calibration_error < calibration_error_threshold) {
                                // Take a picture if the calibration error is below threshold
                                String fileName = Environment.getExternalStorageDirectory().getPath() +
                                        "/AnimationProject/img_viewer.png";
                                Imgproc.cvtColor(backupRgba, backupRgba, Imgproc.COLOR_BGR2RGB);
                                Imgcodecs.imwrite(fileName, backupRgba);
//                                mOpenCvCameraView.takePicture(fileName);
//                                TimeUnit.SECONDS.sleep(1); // Delay 1 second to wait before finishing writing file
                                Log.i(TAG, fileName + " saved");
                                mIsPictureTaken = true;

                                if (!mIsPictureLoaded) {
                                    File file = new File(Environment.getExternalStorageDirectory().getPath() + "/AnimationProject/", "img_viewer.png");
                                    Log.i(TAG, "File exists: " + file.exists());
                                    Log.i(TAG, "Trying to read: " + file.getAbsolutePath());
                                    mLoadedMat = Imgcodecs.imread(file.getAbsolutePath(), Imgcodecs.CV_LOAD_IMAGE_COLOR);
                                    Imgproc.cvtColor(mLoadedMat, mLoadedMat, Imgproc.COLOR_RGB2BGR);
                                    if (mLoadedMat.empty()) {
                                        Log.e(TAG, "Failed, Empty!");
                                    }
//                                    if (mLoadedMat.size() != mRgba.size()) {
                                        Imgproc.resize(mLoadedMat, mLoadedMat, new Size(res_low_width, res_low_height));
//                                    }
                                    mIsPictureLoaded = true;
                                    Log.i(TAG, "Viewer image loaded");
                                }
                                // Image segmentation
                                Mat converted = new Mat();
                                Imgproc.GaussianBlur(mLoadedMat, converted, new Size(3, 3), 0, 0);
                                Imgproc.cvtColor(converted, converted, Imgproc.COLOR_BGR2Lab);
                                int region_size = (int) mLSCparam0;
                                float ratio = mLSCparam1;
                                int min_element_size = (int) mLSCparam2;
                                int num_iteration = (int) mLSCparam3;
                                SuperpixelLSC lsc = Ximgproc.createSuperpixelLSC(converted, region_size, ratio);
                                lsc.iterate(num_iteration);
                                lsc.enforceLabelConnectivity(min_element_size);
                                Mat mask = new Mat();
                                lsc.getLabelContourMask(mask);
                                File seg_file = new File(Environment.getExternalStorageDirectory().getPath() + "/AnimationProject/", "segmentation.png");
                                Imgcodecs.imwrite(seg_file.getAbsolutePath(), mask);

                                Mat labels = new Mat();
                                lsc.getLabels(labels);
                                int num_superpixels = lsc.getNumberOfSuperpixels();
                                Mat label_masks[] = new Mat[num_superpixels];
                                for (int i = 0; i < num_superpixels; i++) {
                                    label_masks[i] = new Mat(res_low_height, res_low_width, CvType.CV_8UC1, Scalar.all(0));
                                }
                                int cx[] = new int[num_superpixels];
                                int cy[] = new int[num_superpixels];
                                int area[] = new int[num_superpixels];
                                Arrays.fill(cx, 0);
                                Arrays.fill(cy, 0);
                                Arrays.fill(area, 0);
                                // Pre-generate a mask for each segment
                                for (int row = 0; row < labels.rows(); row++) {
                                    for (int col = 0; col < labels.cols(); col++) {
                                        int data[] = new int[1];
                                        labels.get(row, col, data);
                                        area[data[0]]++;
                                        label_masks[data[0]].put(row, col, 255);
                                    }
                                }
                                for (int i = 0; i < num_superpixels; i++) {
                                    Moments m = Imgproc.moments(label_masks[i]);
                                    cx[i] = (int) (m.get_m10() / m.get_m00());
                                    cy[i] = (int) (m.get_m01() / m.get_m00());
                                }

                                // Initialize the transformation stack
                                List<Mat> transformation_stack = new ArrayList<Mat>();
                                for (int i = 0; i < num_superpixels; i++) {
                                    transformation_stack.add(Mat.eye(3, 3, CvType.CV_64F));
                                }

                                sc = new Scanner(mDecodedString);
                                float tmp_float;
                                // Skip reference QR code landmarks
                                for (int i = 0; i < 8; i++) {
                                    if (sc.hasNextFloat()) {
                                        tmp_float = sc.nextFloat();
                                    }
                                }
                                // Skip image segmentation parameters
                                for (int i = 0; i < 4; i++) {
                                    if (sc.hasNextFloat()) {
                                        tmp_float = sc.nextFloat();
                                    }
                                }
                                int num_keyframes = 0;
                                if (sc.hasNextInt()) {
                                    num_keyframes = sc.nextInt();
                                }
                                for (int i = 0; i < num_keyframes; i++) {
                                    int num_segments = 0;
                                    if (sc.hasNextInt()) {
                                        num_segments = sc.nextInt();
                                    }
                                    int matched_ids[] = new int[num_segments];
                                    for (int j = 0; j < num_segments; j++) {
                                        int cx_match = 0, cy_match = 0, area_match = 0;
                                        if (sc.hasNextInt()) {
                                            cx_match = sc.nextInt();
                                        }
                                        if (sc.hasNextInt()) {
                                            cy_match = sc.nextInt();
                                        }
                                        if (sc.hasNextInt()) {
                                            area_match = sc.nextInt();
                                        }
//                                        Log.i(TAG, "Segment features: " + cx_match + " " + cy_match + " " + area_match);
                                        int dist = Integer.MAX_VALUE;
                                        int matched_id = 0;
                                        for (int k = 0; k < num_superpixels; k++) {
                                            int curr_dist = (int) (Math.abs(cx[k] - cx_match) + Math.abs(cy[k] - cy_match) + Math.abs(area[k] - area_match) / 1000);
                                            if (curr_dist < dist) {
                                                dist = curr_dist;
                                                matched_id = k;
                                            }
                                        }
                                        matched_ids[j] = matched_id;
                                    }
                                    // Write masks
                                    Mat curr_mask = new Mat(res_low_height, res_low_width, CvType.CV_8UC1, Scalar.all(0));
                                    for (int j = 0; j < num_segments; j++) {
                                        Mat transformed_segment = label_masks[matched_ids[j]].clone();
                                        Mat inv_matrix = transformation_stack.get(matched_ids[j]).clone();
//                                        Log.i(TAG, inv_matrix.get(0, 0)[0] + ", " + inv_matrix.get(0, 1)[0] + ", " + inv_matrix.get(0, 2)[0]);
//                                        Log.i(TAG, inv_matrix.get(1, 0)[0] + ", " + inv_matrix.get(1, 1)[0] + ", " + inv_matrix.get(1, 2)[0]);
//                                        Log.i(TAG, inv_matrix.get(2, 0)[0] + ", " + inv_matrix.get(2, 1)[0] + ", " + inv_matrix.get(2, 2)[0]);
                                        double inv_res = Core.invert(transformation_stack.get(matched_ids[j]), inv_matrix);
                                        if (inv_res == 0) {
                                            Log.e(TAG, "Cannot invert the matrix!");
                                        }
                                        Imgproc.warpPerspective(label_masks[matched_ids[j]], transformed_segment, inv_matrix, transformed_segment.size(), Imgproc.WARP_INVERSE_MAP);
                                        Core.bitwise_or(curr_mask, transformed_segment, curr_mask);
                                    }
                                    // Read keyframe information to update transformation stack
                                    int keyframe_type = 0;
                                    if (sc.hasNextInt()) {
                                        keyframe_type = sc.nextInt();
                                    }
                                    if (keyframe_type == 0 || keyframe_type == 4) {
                                        // Animation scheme: 2D transformation
                                        float translation_x = 0;
                                        float translation_y = 0;
                                        float rotation = 0;
                                        float duration = 0;
                                        if (sc.hasNextFloat()) {
                                            translation_x = sc.nextFloat();
                                        }
                                        if (sc.hasNextFloat()) {
                                            translation_y = sc.nextFloat();
                                        }
                                        if (sc.hasNextFloat()) {
                                            rotation = sc.nextFloat();
                                        }
                                        if (sc.hasNextFloat()) {
                                            duration = sc.nextFloat();
                                        }
                                        Moments m = Imgproc.moments(curr_mask, false);
                                        Point mask_center = new Point(m.get_m10() / m.get_m00(), m.get_m01() / m.get_m00());

                                        Mat transformation_mat = Mat.eye(3, 3, CvType.CV_64F);
                                        Mat mat2x3 = Imgproc.getRotationMatrix2D(mask_center, rotation, 1);
                                        mat2x3.put(0, 2, mat2x3.get(0, 2)[0] + translation_x);
                                        mat2x3.put(1, 2, mat2x3.get(1, 2)[0] + translation_y);
                                        transformation_mat.put(0, 0, mat2x3.get(0, 0)[0]);
                                        transformation_mat.put(0, 1, mat2x3.get(0, 1)[0]);
                                        transformation_mat.put(0, 2, mat2x3.get(0, 2)[0]);
                                        transformation_mat.put(1, 0, mat2x3.get(1, 0)[0]);
                                        transformation_mat.put(1, 1, mat2x3.get(1, 1)[0]);
                                        transformation_mat.put(1, 2, mat2x3.get(1, 2)[0]);
                                        for (int j = 0; j < num_segments; j++) {
                                            Mat new_matrix = transformation_stack.get(matched_ids[j]).clone();
                                            // Core.multiply and Mat.mul are per-element operations!
                                            Core.gemm(transformation_mat, new_matrix, 1, transformation_mat, 0, new_matrix);
                                            transformation_stack.set(matched_ids[j], new_matrix);
                                        }
                                    } else if (keyframe_type == 1 || keyframe_type == 5) {
                                        // Animation scheme: 3D transformation
                                        double[] pts = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
                                        for (int j = 0; j < 16; j++) {
                                            if (sc.hasNextFloat()) {
                                                pts[j] = sc.nextFloat();
                                            }
                                        }
                                        float duration = 0;
                                        if (sc.hasNextFloat()) {
                                            duration = sc.nextFloat();
                                        }

                                        Mat ptp_mat = new Mat(4, 1, CvType.CV_32FC2);
                                        Mat ptq_mat = new Mat(4, 1, CvType.CV_32FC2);
                                        ptp_mat.put(0, 0, pts[0], pts[1], pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
                                        ptq_mat.put(0, 0, pts[8], pts[9], pts[10], pts[11], pts[12], pts[13], pts[14], pts[15]);
                                        Mat perspective = Imgproc.getPerspectiveTransform(ptp_mat, ptq_mat);
                                        for (int j = 0; j < num_segments; j++) {
                                            Mat new_matrix = transformation_stack.get(matched_ids[j]).clone();
                                            Core.gemm(perspective, new_matrix, 1, perspective, 0, new_matrix);
                                            transformation_stack.set(matched_ids[j], new_matrix);
                                        }
                                    } else if (sc.hasNextLine()) {
                                        String tmp = sc.nextLine();
                                    }
                                    File mask_file = new File(Environment.getExternalStorageDirectory().getPath() + "/AnimationProject/", "mask_" + Integer.toString(i) + ".png");
                                    Imgcodecs.imwrite(mask_file.getAbsolutePath(), curr_mask);
                                }
                                sc.close();
                            }
                        }
                    }
                    if (mIsQREverDetected) {
                        // Ground truth landmarks stored in the QR code
                        Imgproc.circle(mRgba, new Point(mLandmarks[0], mLandmarks[1]), 20, new Scalar(255, 0, 0), 3);
                        Imgproc.circle(mRgba, new Point(mLandmarks[2], mLandmarks[3]), 20, new Scalar(255, 0, 0), 3);
                        Imgproc.circle(mRgba, new Point(mLandmarks[4], mLandmarks[5]), 20, new Scalar(255, 0, 0), 3);
                        Imgproc.circle(mRgba, new Point(mLandmarks[6], mLandmarks[7]), 20, new Scalar(255, 0, 0), 3);
                        // Active detection window based on ground truth landmarks
//                        Imgproc.circle(mRgba, new Point(mQRCodeBox[2], mQRCodeBox[0]), 5, new Scalar(0, 0, 255));
//                        Imgproc.circle(mRgba, new Point(mQRCodeBox[2], mQRCodeBox[1]), 5, new Scalar(0, 0, 255));
//                        Imgproc.circle(mRgba, new Point(mQRCodeBox[3], mQRCodeBox[0]), 5, new Scalar(0, 0, 255));
//                        Imgproc.circle(mRgba, new Point(mQRCodeBox[3], mQRCodeBox[1]), 5, new Scalar(0, 0, 255));
                    }
                } catch (ChecksumException | FormatException e) {
                    e.printStackTrace();
                }
                return mRgba;
            }
        } else if (mCurrMode == 2) { // Animation mode
            if (!mIsPictureLoaded) {
                File file = new File(Environment.getExternalStorageDirectory().getPath() + "/AnimationProject/", "img_viewer.png");
                Log.i(TAG, "File exists: " + file.exists());
                Log.i(TAG, "Trying to read: " + file.getAbsolutePath());
                mLoadedMat = Imgcodecs.imread(file.getAbsolutePath(), Imgcodecs.CV_LOAD_IMAGE_COLOR);
                Imgproc.cvtColor(mLoadedMat, mLoadedMat, Imgproc.COLOR_RGB2BGR);
                if (mLoadedMat.empty()) {
                    Log.e(TAG, "Failed, Empty!");
                }
//                if (mLoadedMat.size() != mRgba.size()) {
                    Imgproc.resize(mLoadedMat, mLoadedMat, new Size(res_low_width, res_low_height));
//                }
                mIsPictureLoaded = true;
            }
            // Load decoded QR information if not already
            if (mDecodedString.isEmpty()) {
                Log.i(TAG, "Read QR code text file");
                try {
                    File fileNameQRText = new File(Environment.getExternalStorageDirectory().getPath() +
                            "/AnimationProject/", "qr_decoded.txt");
                    FileInputStream fin = new FileInputStream(fileNameQRText);
                    BufferedReader reader = new BufferedReader(new InputStreamReader(fin));
                    StringBuilder sb = new StringBuilder();
                    String line = null;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line).append("\n");
                    }
                    reader.close();
                    mDecodedString = sb.toString();
                    fin.close();
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }

            // Parse keyframe information from QR decoding
            if (mKeyframes.isEmpty()) {
                Log.e(TAG, "Start parsing the decoded string...");
                Scanner sc = new Scanner(mDecodedString);
                float tmp_float;
                // Skip reference QR code landmarks
                for (int i = 0; i < 8; i++) {
                    if (sc.hasNextFloat()) {
                        tmp_float = sc.nextFloat();
                    }
                }
                // Skip image segmentation parameters
                for (int i = 0; i < 4; i++) {
                    if (sc.hasNextFloat()) {
                        tmp_float = sc.nextFloat();
                    }
                }
                int num_keyframes = 0;
                if (sc.hasNextInt()) {
                    num_keyframes = sc.nextInt();
                }
                for (int i = 0; i < num_keyframes; i++) {
                    int num_segments = 0;
                    if (sc.hasNextInt()) {
                        num_segments = sc.nextInt();
                    }
                    for (int j = 0; j < num_segments; j++) {
                        int cx_match = 0, cy_match = 0, area_match = 0;
                        if (sc.hasNextInt()) {
                            cx_match = sc.nextInt();
                        }
                        if (sc.hasNextInt()) {
                            cy_match = sc.nextInt();
                        }
                        if (sc.hasNextInt()) {
                            area_match = sc.nextInt();
                        }
                    }
                    int keyframe_type = 0;
                    if (sc.hasNextInt()) {
                        keyframe_type = sc.nextInt();
                    }
                    if (keyframe_type == 0 || keyframe_type == 4) {
                        // Animation scheme: 2D transformation
                        float translation_x = 0;
                        float translation_y = 0;
                        float rotation = 0;
                        float duration = 0;
                        if (sc.hasNextFloat()) {
                            translation_x = sc.nextFloat();
                        }
                        if (sc.hasNextFloat()) {
                            translation_y = sc.nextFloat();
                        }
                        if (sc.hasNextFloat()) {
                            rotation = sc.nextFloat();
                        }
                        if (sc.hasNextFloat()) {
                            duration = sc.nextFloat();
                        }
                        double[] pts = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
                        Keyframe curr_keyframe = new Keyframe(keyframe_type, duration, translation_x, translation_y, rotation, pts, 0, "");
                        mKeyframes.add(curr_keyframe);
                    } else if (keyframe_type == 1 || keyframe_type == 5) {
                        // Animation scheme: 3D transformation
                        double[] pts = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
                        for (int j = 0; j < 16; j++) {
                            if (sc.hasNextFloat()) {
                                pts[j] = sc.nextFloat();
                            }
                        }
                        float duration = 0;
                        if (sc.hasNextFloat()) {
                            duration = sc.nextFloat();
                        }
                        Keyframe curr_keyframe = new Keyframe(keyframe_type, duration, 0, 0, 0, pts, 0, "");
                        mKeyframes.add(curr_keyframe);
                    } else if (keyframe_type == 2 || keyframe_type == 6) {
                        // Animation scheme: color transformation
                        float delta_hue = 0;
                        float duration = 0;
                        if (sc.hasNextFloat()) {
                            delta_hue = sc.nextFloat();
                        }
                        if (sc.hasNextFloat()) {
                            duration = sc.nextFloat();
                        }
                        double[] pts = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
                        Keyframe curr_keyframe = new Keyframe(keyframe_type, duration, 0, 0, 0, pts, delta_hue, "");
                        mKeyframes.add(curr_keyframe);
                    } else if (keyframe_type == 3) {
                        // Animation scheme: annotation
                        String annotation = "";
                        float duration = 0;
                        if (sc.hasNext()) {
                            annotation = sc.next();
                        }
                        if (sc.hasNextFloat()) {
                            duration = sc.nextFloat();
                        }
                        double[] pts = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
                        Keyframe curr_keyframe = new Keyframe(keyframe_type, duration, 0, 0, 0, pts, 0, annotation);
                        mKeyframes.add(curr_keyframe);
                    }
                }
                sc.close();
//                for (int i = 0; i < mKeyframes.size(); i++) {
//                    Log.e(TAG, i + " Keyframe: " + mKeyframes.get(i).type +
//                            " " + mKeyframes.get(i).duration + " " + mKeyframes.get(i).translation_x +
//                            " " + mKeyframes.get(i).translation_y + " " + mKeyframes.get(i).rotation + "\n" +
//                            "(" + mKeyframes.get(i).ptp.get(0).x + ", " + mKeyframes.get(i).ptp.get(0).y + ") " +
//                            "(" + mKeyframes.get(i).ptp.get(1).x + ", " + mKeyframes.get(i).ptp.get(1).y + ") " +
//                            "(" + mKeyframes.get(i).ptp.get(2).x + ", " + mKeyframes.get(i).ptp.get(2).y + ") " +
//                            "(" + mKeyframes.get(i).ptp.get(3).x + ", " + mKeyframes.get(i).ptp.get(3).y + ") " +
//                            "(" + mKeyframes.get(i).ptq.get(0).x + ", " + mKeyframes.get(i).ptq.get(0).y + ") " +
//                            "(" + mKeyframes.get(i).ptq.get(1).x + ", " + mKeyframes.get(i).ptq.get(1).y + ") " +
//                            "(" + mKeyframes.get(i).ptq.get(2).x + ", " + mKeyframes.get(i).ptq.get(2).y + ") " +
//                            "(" + mKeyframes.get(i).ptq.get(3).x + ", " + mKeyframes.get(i).ptq.get(3).y + ") " + "\n" +
//                            mKeyframes.get(i).delta_hue + " " + mKeyframes.get(i).annotation);
//                }
                // Load masks
                for (int i = 0; i < mKeyframes.size(); i++) {
                    Mat curr_mask = new Mat(res_low_height, res_low_width, CvType.CV_8UC1);
                    File file = new File(Environment.getExternalStorageDirectory().getPath() + "/AnimationProject/", "mask_" + Integer.toString(i) + ".png");
                    Log.i(TAG, "File exists: " + file.exists());
                    Log.i(TAG, "Trying to read: " + file.getAbsolutePath());
                    curr_mask = Imgcodecs.imread(file.getAbsolutePath(), Imgcodecs.CV_LOAD_IMAGE_GRAYSCALE);
                    if (curr_mask.empty()) {
                        Log.e(TAG, "Failed, Empty!");
                    }
                    mLoadedMasks.add(curr_mask);
                }
            }
            // Animate
            if (mCurrKeyFrame >= mKeyframes.size()) {
                return mAnimatedMat;
            }
            Log.i(TAG, "mCurrKeyFrame: " + mCurrKeyFrame + ", mCurrFrame: " + mCurrFrame);
//            Log.e(TAG, "Loaded mat size: " + mLoadedMat.rows() + " " + mLoadedMat.cols());
            mAnimatedMat = animate(mLoadedMat, mKeyframes, mCurrKeyFrame, mCurrFrame);
//            Log.e(TAG, "Animated mat size: " + mAnimatedMat.rows() + " " + mAnimatedMat.cols());
            mPrevKeyFrame = mCurrKeyFrame;
            mCurrFrame++;
            if (mCurrFrame > mKeyframes.get(mCurrKeyFrame).duration * 30) {
                if (mKeyframes.get(mCurrKeyFrame).type != 3) {
                    // Update base image if not an annotation keyframe
//                    mLoadedMat = mAnimatedMat;
                    Imgproc.resize(mAnimatedMat, mLoadedMat, new Size(res_low_width, res_low_height));
                }
                mIsInpainted = false;
                mCurrFrame = 0;
                mCurrKeyFrame++;
            }
            Imgproc.resize(mAnimatedMat, mAnimatedMat, new Size(res_width, res_height));
//            Log.e(TAG, "Animated mat size 2: " + mAnimatedMat.rows() + " " + mAnimatedMat.cols());
            return mAnimatedMat;
        }
        return mRgba;
    }

    private Mat animate(Mat src, List<Keyframe> keyframes, int curr_keyframe, int curr_frame) {
        float curr_ratio = curr_frame / (30 * keyframes.get(curr_keyframe).duration);
        // Quadratic interpolation
        if (keyframes.get(curr_keyframe).type >= 4) {
            curr_ratio = curr_ratio * curr_ratio;
        }
        // Use previous inpainted result as base image if ROI remains the same
        boolean is_load_old_inpainted = false;
        if (curr_keyframe > 0) {
            Mat curr_mask = mLoadedMasks.get(curr_keyframe);
            Mat prev_mask = mLoadedMasks.get(curr_keyframe - 1);
            Mat diff_mask = new Mat();
            Core.subtract(curr_mask, prev_mask, diff_mask);
            int curr_area = Core.countNonZero(curr_mask);
            int prev_area = Core.countNonZero(prev_mask);
            int diff_area = Core.countNonZero(diff_mask);
            if (Math.abs(curr_area - prev_area) < 10 && diff_area > 0) {
                is_load_old_inpainted = true;
            }
        }
        if (keyframes.get(curr_keyframe).type == 0 || keyframes.get(curr_keyframe).type == 4) {
            // 2D transformation
            if (!mIsInpainted) {
                mROI = src.clone();
                mDilatedMask = mLoadedMasks.get(curr_keyframe).clone();

                int dilation_size = 2;
                Mat element = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE,
                        new org.opencv.core.Size(2 * dilation_size + 1, 2 * dilation_size + 1),
                        new Point(dilation_size, dilation_size));
                Imgproc.dilate(mLoadedMasks.get(curr_keyframe), mDilatedMask, element);

                if (!is_load_old_inpainted) {
                    Photo.inpaint(src, mDilatedMask, mInpainted, 3, Photo.INPAINT_TELEA);
                }

                Moments m = Imgproc.moments(mDilatedMask, false);
                mCenterX = m.get_m10() / m.get_m00(); // x is for col
                mCenterY = m.get_m01() / m.get_m00(); // y is for row
                Imgproc.cvtColor(mDilatedMask, mDilatedMask, Imgproc.COLOR_GRAY2BGR);
                Core.multiply(src, mDilatedMask, mROI, 1.0 / 255);

                mIsInpainted = true;
            }

            Mat transformation_mat = Imgproc.getRotationMatrix2D(new Point(mCenterX, mCenterY), curr_ratio * keyframes.get(curr_keyframe).rotation, 1);
            double tx = transformation_mat.get(0, 2)[0];
            double ty = transformation_mat.get(1, 2)[0];
            tx += curr_ratio * keyframes.get(curr_keyframe).translation_x;
            ty += curr_ratio * keyframes.get(curr_keyframe).translation_y;
            transformation_mat.put(0, 2, tx);
            transformation_mat.put(1, 2, ty);

            Mat transformation_mat_inv = new Mat();
            Imgproc.invertAffineTransform(transformation_mat, transformation_mat_inv);

            Mat dst = new Mat();
            Imgproc.warpAffine(mROI, dst, transformation_mat_inv, mROI.size(), Imgproc.WARP_INVERSE_MAP);
            Mat dst_mask = new Mat();
            Imgproc.warpAffine(mDilatedMask, dst_mask, transformation_mat_inv, mDilatedMask.size(), Imgproc.WARP_INVERSE_MAP);
            Imgproc.cvtColor(dst_mask, dst_mask, Imgproc.COLOR_BGR2GRAY);
//            Imgproc.threshold(dst_mask, dst_mask, 0, 255, Imgproc.THRESH_BINARY); // Wrong way to get the current mask

            Mat neg_mask = new Mat();
            Core.bitwise_not(dst_mask, neg_mask);
            Imgproc.cvtColor(neg_mask, neg_mask, Imgproc.COLOR_GRAY2BGR);
            Imgproc.cvtColor(dst_mask, dst_mask, Imgproc.COLOR_GRAY2BGR);

            Mat neg_dst = new Mat();
            Core.multiply(mInpainted, neg_mask, neg_dst, 1.0 / 255);
            Core.addWeighted(dst, 1, neg_dst, 1, 0, dst);

            dst_mask.release();
            neg_mask.release();
            neg_dst.release();
            return dst;
        } else if (keyframes.get(curr_keyframe).type == 1 || keyframes.get(curr_keyframe).type == 5) {
            // 3D transformation
            if (!mIsInpainted) {
                mROI = src.clone();
                mDilatedMask = mLoadedMasks.get(curr_keyframe).clone();
                int dilation_size = 2;
                Mat element = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE,
                        new org.opencv.core.Size(2 * dilation_size + 1, 2 * dilation_size + 1),
                        new Point(dilation_size, dilation_size));
                Imgproc.dilate(mLoadedMasks.get(curr_keyframe), mDilatedMask, element);

                if (!is_load_old_inpainted) {
                    Photo.inpaint(src, mDilatedMask, mInpainted, 3, Photo.INPAINT_TELEA);
                }

                Moments m = Imgproc.moments(mDilatedMask, false);
                mCenterX = m.get_m10() / m.get_m00(); // x is for col
                mCenterY = m.get_m01() / m.get_m00(); // y is for row
                Imgproc.cvtColor(mDilatedMask, mDilatedMask, Imgproc.COLOR_GRAY2BGR);
                Core.multiply(src, mDilatedMask, mROI, 1.0 / 255);

                mIsInpainted = true;
            }

            List<Point> curr_ptq = new ArrayList<Point>();
            for (int i = 0; i < 4; i++) {
                curr_ptq.add(new Point(keyframes.get(curr_keyframe).ptp.get(i).x + (keyframes.get(curr_keyframe).ptq.get(i).x - keyframes.get(curr_keyframe).ptp.get(i).x) * curr_ratio,
                        keyframes.get(curr_keyframe).ptp.get(i).y + (keyframes.get(curr_keyframe).ptq.get(i).y - keyframes.get(curr_keyframe).ptp.get(i).y) * curr_ratio));
            }
            Mat ptp_mat = new Mat(4, 1, CvType.CV_32FC2);
            Mat curr_ptq_mat = new Mat(4, 1, CvType.CV_32FC2);
            ptp_mat.put(0, 0,
                    keyframes.get(curr_keyframe).ptp.get(0).x, keyframes.get(curr_keyframe).ptp.get(0).y,
                    keyframes.get(curr_keyframe).ptp.get(1).x, keyframes.get(curr_keyframe).ptp.get(1).y,
                    keyframes.get(curr_keyframe).ptp.get(2).x, keyframes.get(curr_keyframe).ptp.get(2).y,
                    keyframes.get(curr_keyframe).ptp.get(3).x, keyframes.get(curr_keyframe).ptp.get(3).y);
            curr_ptq_mat.put(0, 0,
                    curr_ptq.get(0).x, curr_ptq.get(0).y, curr_ptq.get(1).x, curr_ptq.get(1).y,
                    curr_ptq.get(2).x, curr_ptq.get(2).y, curr_ptq.get(3).x, curr_ptq.get(3).y);
            Mat perspective = Imgproc.getPerspectiveTransform(ptp_mat, curr_ptq_mat);
            Mat perspective_i = perspective.clone();
            double inv_res = Core.invert(perspective, perspective_i);
            if (inv_res == 0) {
                Log.e(TAG, "Cannot invert the matrix!");
            }

            Mat dst = new Mat();
            Imgproc.warpPerspective(mROI, dst, perspective_i, mROI.size(), Imgproc.WARP_INVERSE_MAP);
            Mat dst_mask = new Mat();
            Imgproc.warpPerspective(mDilatedMask, dst_mask, perspective_i, mDilatedMask.size(), Imgproc.WARP_INVERSE_MAP);
            Imgproc.cvtColor(dst_mask, dst_mask, Imgproc.COLOR_BGR2GRAY);
//            Imgproc.threshold(dst_mask, dst_mask, 0, 255, Imgproc.THRESH_BINARY); // Wrong way to get the current mask

            Mat neg_mask = new Mat();
            Core.bitwise_not(dst_mask, neg_mask);
            Imgproc.cvtColor(neg_mask, neg_mask, Imgproc.COLOR_GRAY2BGR);
            Imgproc.cvtColor(dst_mask, dst_mask, Imgproc.COLOR_GRAY2BGR);

            Mat neg_dst = new Mat();
            Core.multiply(mInpainted, neg_mask, neg_dst, 1.0 / 255);
            Core.addWeighted(dst, 1, neg_dst, 1, 0, dst);

            dst_mask.release();
            neg_mask.release();
            neg_dst.release();
            return dst;
        } else if (keyframes.get(curr_keyframe).type == 2 || keyframes.get(curr_keyframe).type == 6) {
            // Color transformation
            float curr_delta_hue = curr_ratio * keyframes.get(curr_keyframe).delta_hue;
            Mat mask = mLoadedMasks.get(curr_keyframe).clone();
//            int dilation_size = 2;
//            Mat element = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE,
//                    new org.opencv.core.Size(2 * dilation_size + 1, 2 * dilation_size + 1),
//                    new Point(dilation_size, dilation_size));
//            Imgproc.dilate(mLoadedMasks.get(curr_keyframe), mask, element);

            Mat dst = src.clone(); // 3 channels
            Imgproc.cvtColor(src, dst, Imgproc.COLOR_BGR2HSV);
            List<Mat> hsv_channels = new ArrayList<Mat>();
            Core.split(dst, hsv_channels);
            Mat hue_channel = new Mat();
            Core.addWeighted(hsv_channels.get(0), 1, mask, -curr_delta_hue / 2.0 / 255, 0, hue_channel);
            Mat hue_underflow = new Mat();
            Mat hue_overflow = new Mat();
            Imgproc.threshold(hue_channel, hue_underflow, -0.01, 255, Imgproc.THRESH_BINARY_INV);
            Imgproc.threshold(hue_channel, hue_overflow, 180, 255, Imgproc.THRESH_BINARY);
            Core.subtract(hue_channel, new Scalar(180), hue_channel, hue_overflow);
            Core.add(hue_channel, new Scalar(180), hue_channel, hue_underflow);

            hsv_channels.set(0, hue_channel);
            Core.merge(hsv_channels, dst);
            Imgproc.cvtColor(dst, dst, Imgproc.COLOR_HSV2BGR);

            mask.release();
            hue_channel.release();
            hue_underflow.release();
            hue_overflow.release();
            return dst;
            /*
            * byte mask_buff[] = new byte[(int) (mLoadedMasks.get(curr_keyframe).total() * mLoadedMasks.get(curr_keyframe).channels())];
            mLoadedMasks.get(curr_keyframe).get(0, 0, mask_buff);

            byte buff[] = new byte[(int) (dst.total() * dst.channels())];
            dst.get(0, 0, buff);
            for (int row = 0; row < src.rows(); row++) {
                for (int col = 0; col < src.cols(); col++) {
                    if (mask_buff[row * src.cols() + col] > 0) {
                        buff[dst.channels() * (row * src.cols() + col)] += curr_delta_hue;
                        if (buff[dst.channels() * (row * src.cols() + col)] > 255) {
                            buff[dst.channels() * (row * src.cols() + col)] -= 255;
                        }
                    }
                }
            }
            dst.put(0, 0, buff);
            */
        } else if (keyframes.get(curr_keyframe).type == 3) {
            // Annotation
            if (mPrevKeyFrame == mCurrKeyFrame) {
                return mCachedAnnotation;
            }
            Mat src_bilateral = src.clone();
            Imgproc.bilateralFilter(src, src_bilateral, 15, 80, 80);

            Mat dilated_mask = mLoadedMasks.get(curr_keyframe).clone();
            int dilation_size = 10;
            Mat element = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE,
                    new org.opencv.core.Size(2 * dilation_size + 1, 2 * dilation_size + 1),
                    new Point(dilation_size, dilation_size));
            Imgproc.dilate(mLoadedMasks.get(curr_keyframe), dilated_mask, element);

            Mat contour = new Mat();
            Imgproc.Canny(dilated_mask, contour, 100, 200);
            int dilation_size_c = 3;
            Mat element_c = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE,
                    new org.opencv.core.Size(2 * dilation_size_c + 1, 2 * dilation_size_c + 1),
                    new Point(dilation_size_c, dilation_size_c));
            Imgproc.dilate(contour, contour, element_c);

            Mat pos_dst = src.clone();
            Mat pos_mask = dilated_mask.clone();
            Imgproc.cvtColor(pos_mask, pos_mask, Imgproc.COLOR_GRAY2BGR);
            Core.multiply(src, pos_mask, pos_dst, 1.0 / 255);

            Mat neg_dst = src.clone();
            Mat neg_mask = dilated_mask.clone();
            Core.bitwise_not(neg_mask, neg_mask);
            Imgproc.cvtColor(neg_mask, neg_mask, Imgproc.COLOR_GRAY2BGR);
            Core.multiply(src_bilateral, neg_mask, neg_dst, 1.0 / 255);

            Mat dst = src.clone();
            Core.addWeighted(pos_dst, 1, neg_dst, 0.7, 0, dst);

            Mat red_contour = src.clone();
            red_contour.setTo(new Scalar(0, 0, 0));
            red_contour.setTo(new Scalar(255, 0, 0), contour);
            Core.bitwise_not(contour, contour);
            Imgproc.cvtColor(contour, contour, Imgproc.COLOR_GRAY2BGR);
            Core.multiply(dst, contour, dst, 1.0 / 255);
            Core.add(dst, red_contour, dst);
            Imgproc.putText(dst, keyframes.get(curr_keyframe).annotation, new Point(20, 40),
                    Core.FONT_HERSHEY_DUPLEX, 1.0, new Scalar(255, 255, 255), 1);

            mCachedAnnotation = dst;
            src_bilateral.release();
            dilated_mask.release();
            pos_dst.release();
            pos_mask.release();
            neg_dst.release();
            neg_mask.release();
            contour.release();
            red_contour.release();
            return mCachedAnnotation;
        }
        return src;
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        Log.e(TAG, "called onCreateOptionsMenu");
        mAuthorMenu = menu.add("Author Takes Image");
        mViewerMenu = menu.add("Viewer Takes Image");
        mAnimationMenu = menu.add("Generate Animation");
        return true;

//        List<String> effects = mOpenCvCameraView.getEffectList();
//
//        if (effects == null) {
//            Log.e(TAG, "Color effects are not supported by device!");
//            return true;
//        }
//
//        mColorEffectsMenu = menu.addSubMenu("Color Effect");
//        mEffectMenuItems = new MenuItem[effects.size()];
//
//        int idx = 0;
//        ListIterator<String> effectItr = effects.listIterator();
//        while(effectItr.hasNext()) {
//            String element = effectItr.next();
//            mEffectMenuItems[idx] = mColorEffectsMenu.add(1, idx, Menu.NONE, element);
//            idx++;
//        }

        // DO NOT CHANGE RESOLUTION DUE TO FIXED SIZE
//        mResolutionMenu = menu.addSubMenu("Resolution");
//        mResolutionList = mOpenCvCameraView.getResolutionList();
//        mResolutionMenuItems = new MenuItem[mResolutionList.size()];
//
//        ListIterator<Size> resolutionItr = mResolutionList.listIterator();
//        idx = 0;
//        while(resolutionItr.hasNext()) {
//            Size element = resolutionItr.next();
//            mResolutionMenuItems[idx] = mResolutionMenu.add(2, idx, Menu.NONE,
//                    Integer.valueOf(element.width).toString() + "x" + Integer.valueOf(element.height).toString());
//            idx++;
//        }
    }

    public boolean onOptionsItemSelected(MenuItem item) {
        Log.i(TAG, "called onOptionsItemSelected; selected item: " + item);
        if (item == mAuthorMenu) {
            mCurrMode = 0;
        } else if (item == mViewerMenu) {
            mCurrMode = 1;
            // Reset all states
            mIsPictureTaken = false;
            mIsPictureLoaded = false;
            mIsQREverDetected = false;
            mQRCodeBox[0] = 0; mQRCodeBox[1] = res_height; // rowStart, rowEnd
            mQRCodeBox[2] = 0; mQRCodeBox[3] = res_width; // colStart, colEnd
            mDecodedString = "";
            mKeyframes.clear();
            mLoadedMasks.clear();
        } else if (item == mAnimationMenu) {
            mCurrMode = 2;
            // Load a new image
            mIsPictureLoaded = false;
            mCurrKeyFrame = 0;
            mCurrFrame = 0;
            mKeyframes.clear();
        }
        return true;

        // Change color effects
//        if (item.getGroupId() == 1)
//        {
//            mOpenCvCameraView.setEffect((String) item.getTitle());
//            Toast.makeText(this, mOpenCvCameraView.getEffect(), Toast.LENGTH_SHORT).show();
//        }
        // DO NOT CHANGE RESOLUTION DUE TO FIXED SIZE
//        else if (item.getGroupId() == 5)
//        {
//            int id = item.getItemId();
//            Size resolution = mResolutionList.get(id);
//            mOpenCvCameraView.setResolution(resolution);
//            resolution = mOpenCvCameraView.getResolution();
//            String caption = Integer.valueOf(resolution.width).toString() + "x" + Integer.valueOf(resolution.height).toString();
//            Toast.makeText(this, caption, Toast.LENGTH_SHORT).show();
//        }
    }

    @SuppressLint("SimpleDateFormat")
    @Override
    public boolean onTouch(View v, MotionEvent event) {
        if (mCurrMode == 0) {
            Log.i(TAG, "onTouch event");
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss");
            String currentDateandTime = sdf.format(new Date());
            String fileName = Environment.getExternalStorageDirectory().getPath() +
                    "/AnimationProject/img_author_" + currentDateandTime + ".jpg";
            mOpenCvCameraView.takePicture(fileName);
            Toast.makeText(this, fileName + " saved", Toast.LENGTH_SHORT).show();
        }
        return false;
    }
}

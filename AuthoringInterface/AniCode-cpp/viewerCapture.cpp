//
//  viewerCapture.cpp
//  QRCode-cpp
//
//  Created by wangzeyu on 10/24/17.
//  Copyright © 2017 wangzeyu. All rights reserved.
//

#include <string>
#include <exception>
#include <stdlib.h>
#include <fstream>
#include <sstream>
#include <zxing/common/Counted.h>
#include <zxing/Binarizer.h>
#include <zxing/MultiFormatReader.h>
#include <zxing/Result.h>
#include <zxing/ReaderException.h>
#include <zxing/common/GlobalHistogramBinarizer.h>
#include <zxing/Exception.h>
#include <zxing/common/IllegalArgumentException.h>
#include <zxing/BinaryBitmap.h>
#include <zxing/DecodeHints.h>
#include <zxing/qrcode/QRCodeReader.h>
#include <zxing/MultiFormatReader.h>
#include <zxing/MatSource.h>
#include <opencv2/core/core.hpp>
#include <opencv2/highgui/highgui.hpp>
#include <opencv2/imgproc/imgproc.hpp>

#include "viewerCapture.hpp"
#include "utils.hpp"

using namespace zxing;
using namespace zxing::qrcode;
using namespace cv;

void viewerCapture(string write_img_file, string decoded_qr_file) {
    ofstream decoded_qr(decoded_qr_file);
    int deviceId = 0;
    int captureWidth = 640;
    int captureHeight = 480;
    float threshold_calibration_error = 15;
    bool multi = false;
    Point2f authorPoints[4] = {Point2f(-10, -10), Point2f(-10, -10), Point2f(-10, -10), Point2f(-10, -10)};
    
    // Log
    cout << "Capturing from device " << deviceId << "..." << endl;
    
    // Open video captire
    VideoCapture videoCapture(deviceId);
    
    if (!videoCapture.isOpened()) {
        
        // Log
        cerr << "Open video capture failed on device id: " << deviceId << endl;
        return;
        
    }
    
    if (!videoCapture.set(CV_CAP_PROP_FRAME_WIDTH, captureWidth)) {
        
        // Log
        cerr << "Failed to set frame width: " << captureWidth << " (ignoring)" << endl;
        
    }
    
    if (!videoCapture.set(CV_CAP_PROP_FRAME_HEIGHT, captureHeight)) {
        
        // Log
        cerr << "Failed to set frame height: " << captureHeight << " (ignoring)" << endl;
        
    }
    
    // The captured image and its grey conversion
    Mat image, grey, frame;
    
    // Open output window
    namedWindow("Viewer Capturing", cv::WINDOW_AUTOSIZE);
    
    // Stopped flag will be set to -1 from subsequent wayKey() if no key was pressed
    int stopped = -1;
    
    while (stopped == -1) {
        // Capture image
        bool result = videoCapture.read(image);
        
        if (result) {
            
            // Convert to grayscale
            cvtColor(image, grey, CV_BGR2GRAY);
            frame = image.clone();
            for (int j = 0; j < 4; j++) {
                // Draw circle
                circle(frame, authorPoints[j], 10, Scalar(110, 220, 0), 2);
            }
            
            try {
                
                // Create luminance  source
                Ref<LuminanceSource> source = MatSource::create(grey);
                
                // Search for QR code
                Ref<Reader> reader;
                
                if (multi) {
                    reader.reset(new MultiFormatReader);
                } else {
                    reader.reset(new QRCodeReader);
                }
                
                Ref<Binarizer> binarizer(new GlobalHistogramBinarizer(source));
                Ref<BinaryBitmap> bitmap(new BinaryBitmap(binarizer));
                Ref<Result> result(reader->decode(bitmap, DecodeHints(DecodeHints::TRYHARDER_HINT)));
                
                // Get result point count
                int resultPointCount = result->getResultPoints()->size();
                
                // QR code should have 4 landmarks
                if (resultPointCount == 4) {
                    // Update the positions of landmarks encoded in the QR code
                    istringstream parse_qrcode(result->getText()->getText());
                    parse_qrcode >> authorPoints[0].x >> authorPoints[0].y >> authorPoints[1].x >> authorPoints[1].y >> authorPoints[2].x >> authorPoints[2].y >> authorPoints[3].x >> authorPoints[3].y;
                    
                    float calibration_error = 0;
                    for (int j = 0; j < resultPointCount; j++) {
                        // Draw circle
                        circle(frame, toCvPoint(result->getResultPoints()[j]), 10, Scalar(110, 0, 220), 2);
                        // Get start result point
                        Ref<ResultPoint> previousResultPoint = (j > 0) ? result->getResultPoints()[j - 1] : result->getResultPoints()[resultPointCount - 1];
                        // Draw line
                        line(frame, toCvPoint(previousResultPoint), toCvPoint(result->getResultPoints()[j]), Scalar(110, 0, 220),  2, 8);
                        // Update previous point
                        previousResultPoint = result->getResultPoints()[j];
                        // Compute error to author's points
                        calibration_error += norm(authorPoints[j] - toCvPoint(result->getResultPoints()[j]));
                    }
                    cout << "Calibration error: " << calibration_error << endl;
                    if (calibration_error < threshold_calibration_error) {
                        // Write viewer calibrated image to file
                        imwrite(write_img_file, image);
                        decoded_qr << result->getText()->getText() << endl;
                        decoded_qr.close();
                        break;
                    }
                }
                
            } catch (const ReaderException& e) {
                //                cerr << e.what() << " (ignoring)" << endl;
            } catch (const zxing::IllegalArgumentException& e) {
                //                cerr << e.what() << " (ignoring)" << endl;
            } catch (const zxing::Exception& e) {
                //                cerr << e.what() << " (ignoring)" << endl;
            } catch (const std::exception& e) {
                //                cerr << e.what() << " (ignoring)" << endl;
            }
            
            // Show captured image
            imshow("Viewer Capturing", frame);
            stopped = waitKey(1);
            
        } else {
            
            // Log
            cerr << "video capture failed" << endl;
            
        }
        
    }
    
    // Release video capture
    videoCapture.release();
}

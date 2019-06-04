/*
 *  Copyright 2017 Zeyu Wang
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include <exception>
#include <fstream>
#include <iostream>
#include <opencv2/opencv.hpp>
#include <opencv2/ximgproc.hpp>
#include <stdlib.h>
#include <string>
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

#include "authorCapture.hpp"
#include "viewerCapture.hpp"
#include "keyframe.hpp"

using namespace std;
using namespace zxing;
using namespace zxing::qrcode;
using namespace cv;
using namespace cv::ximgproc;

enum Functionality{AUTHOR_TAKING_PIC, VIEWER_TAKING_PIC, ANIMATING, SEGMENTATION};
/***
To build the binary segment
    set active_functionality to SEGMENTATION
    uncomment lines 83-87, comment lines 73-82
    set is_matching to false in line 129
    run cmake . and make
    rename anicode to segment

To build the binary match
    set active_functionality to SEGMENTATION
    uncomment lines 78-82, comment lines 73-77 and 83-87
    set is_matching to true in line 129
    run cmake . and make
    rename anicode to match

To build the binary animate
    set active_functionality to ANIMATING
    uncomment lines 73-77, comment lines 78-87
    run cmake . and make
    rename anicode to animate
 ***/
int main(int argc, char** argv) {
    string directory = "";
    int active_functionality = SEGMENTATION;
    if (argc != 4) {
        cerr << "Usage: ./animate src_img.png qr.txt dst_video.avi" << endl;
        cerr << "Only works for files in the current folder due to the path of masks!" << endl;
        return -1;
    }
    // if (argc != 3) {
    //     cerr << "Usage: ./match src_img.jpg qr.txt" << endl;
    //     cerr << "Only works for files in the current folder due to the path of masks!" << endl;
    //     return -1;
    // }
    // if (argc != 2 && argc != 8) {
    //     cerr << "Usage: ./segment src_img.jpg" << endl;
    //     cerr << "Optionally set the range for parameters: ./segment src_img.jpg region_size_from region_size_to ratio_from ratio_to num_iterations_from num_iterations_to" << endl;
    //     return -1;
    // }
//        directory = "/Users/wangzeyu/Desktop/AuthoringAnimation/AnimationDemo/";
//        cout << "Please specify a functionality code\n0: author takes picture,\n1: viewer takes picture,\n2: generate animation,\n3: image segmentation\n";
//        cin >> active_functionality;
    if (active_functionality == AUTHOR_TAKING_PIC) {
        // Capture an image when the author presses 'C' as long as a QR code is detecable
        // The image that the author takes will be saved according to the following path
        // There will be 8 floating numbers (coordinates of QR code landmarks) in the text file
        authorCapture(directory + "img_author.png", directory + "qr_author_landmarks.txt");
        // With the detected landmark positions, the author will generate the QR code in the web interface
        
    } else if (active_functionality == VIEWER_TAKING_PIC) {
        // Calculate the calibration error based on the first 8 floating numbers in the QR code
        // Capture an image when it is below a threshold. Decoded information will be written to a file
        viewerCapture(directory + "img_viewer.png", directory + "qr_decoded.txt");
        // Based on the decoded information, the animation will be generated with constructed keyframes
        
    } else if (active_functionality == ANIMATING) {
        // Construct keyframes from the decoded information
        vector<Keyframe*> decoded_keyframes = decode_keyframes(directory + argv[2]/*"qr_decoded.txt"*/);
        
        Mat src = imread(directory + argv[1]/*"img_author.png"*/);
        Mat old_inpainted = src.clone();
        string mask_prefix = "mask_";
        VideoWriter vout(directory + argv[3]/*"video_author.avi"*/, VideoWriter::fourcc('M','J','P','G'), 30.0, Size(src.cols, src.rows));
        if (!vout.isOpened()) {
            cerr << "Video writer not opened!" << endl;
            return -1;
        }
        
        for (int i = 0; i < decoded_keyframes.size(); i++) {
            add_keyframe(old_inpainted, src, decoded_keyframes[i], vout, i, directory, mask_prefix);
        }
        
        for (int i = 0; i < decoded_keyframes.size(); i++) {
            delete decoded_keyframes[i];
        }
        vout.release();
        
    } else if (active_functionality == SEGMENTATION) {
        // Turn this off when doing image segmentation for the author
        // Turn this on when doing image segmentation for the viewer
        bool is_matching = true;
        Mat src = imread(directory + argv[1]/*"img_author.jpg"*/);
        resize(src, src, Size(640, 480));
        string png_filename = argv[1];
        png_filename[png_filename.size() - 3] = 'p';
        png_filename[png_filename.size() - 2] = 'n';
        png_filename[png_filename.size() - 1] = 'g';
        imwrite(directory + png_filename/*"img_author.png"*/, src);
        GaussianBlur(src, src, Size(3, 3), 0, 0);
        Mat converted;
        cvtColor(src, converted, COLOR_BGR2Lab);
        
        if (!is_matching) {
            int region_size_from = 20, region_size_to = 100;
            float ratio_from = 0.025, ratio_to = 0.075001;
            int min_element_size = 20; // Not iterate over this parameter because it has little effect
            int num_iterations_from = 6, num_iterations_to = 6;
            
            if (argc == 8) {
                region_size_from = atoi(argv[2]);
                region_size_to = atoi(argv[3]);
                ratio_from = atof(argv[4]);
                ratio_to = atof(argv[5]);
                num_iterations_from = atoi(argv[6]);
                num_iterations_to = atoi(argv[7]);
            }
            
            for (int region_size_curr = region_size_from; region_size_curr <= region_size_to; region_size_curr += 20) {
                for (float ratio_curr = ratio_from; ratio_curr <= ratio_to; ratio_curr += 0.025) {
                    for (int num_iterations_curr = num_iterations_from; num_iterations_curr <= num_iterations_to; num_iterations_curr += 3) {
                        
                        Ptr<SuperpixelLSC> lsc = ximgproc::createSuperpixelLSC(converted, region_size_curr, ratio_curr);
                        lsc->iterate(num_iterations_curr);
                        lsc->enforceLabelConnectivity(min_element_size);
                        Mat result = src.clone();
                        Mat labels;
                        lsc->getLabels(labels);
                        int num_superpixels = lsc->getNumberOfSuperpixels();
                        int* cx = new int [num_superpixels];
                        int* cy = new int [num_superpixels];
                        int* area = new int [num_superpixels];
                        memset(area, 0, num_superpixels * sizeof(int));
                        ofstream index_out(directory + "seg_" + to_string(region_size_curr) + "_" + to_string(ratio_curr) + "_" + to_string(min_element_size) + "_" + to_string(num_iterations_curr) + "_index.csv"/*"seg_index.csv"*/);
                        for (int row = 0; row < labels.rows; row++) {
                            for (int col = 0; col < labels.cols; col++) {
                                area[labels.at<int>(row, col)]++;
                                index_out << labels.at<int>(row, col) << ',';
                            }
                            index_out << '\n';
                        }
                        index_out.close();
                        
                        ofstream feature_out(directory + "seg_" + to_string(region_size_curr) + "_" + to_string(ratio_curr) + "_" + to_string(min_element_size) + "_" + to_string(num_iterations_curr) + "_feature.csv"/*"seg_feature.csv"*/);
                        for (int i = 0; i < num_superpixels; i++) {
                            Mat curr_mask = (labels == i);
                            Moments m = moments(curr_mask);
                            cx[i] = (int)(m.m10 / m.m00);
                            cy[i] = (int)(m.m01 / m.m00);
                            feature_out << i << ',' << cx[i] << ',' << cy[i] << ',' << area[i] << '\n';
                        }
                        
                        delete [] cx;
                        delete [] cy;
                        delete [] area;
                        
                        Mat mask;
                        lsc->getLabelContourMask(mask, false);
                        result.setTo(Scalar(0, 0, 255), mask);
                        imwrite(directory + "seg_" + to_string(region_size_curr) + "_" + to_string(ratio_curr) + "_" + to_string(min_element_size) + "_" + to_string(num_iterations_curr) + "_result.png"/*"seg_result.png"*/, result);
                    }
                }
            }
            
        }
        
        if (is_matching) {
            
            ifstream fin(directory + argv[2]/*"qr_decoded.txt"*/);
            if (!fin.is_open()) {
                cerr << "Cannot open QR code text file!\n";
                return -1;
            }
            
            string f;
            for (int i = 0; i < 8; i++) fin >> f; // QR code landmarks
            int region_size = 60;
            float ratio = 0.050;
            int min_element_size = 20;
            int num_iterations = 6;
            // LSC parameters
            int num_keyframes;
            fin >> region_size >> ratio >> min_element_size >> num_iterations >> num_keyframes;
            
            Ptr<SuperpixelLSC> lsc = ximgproc::createSuperpixelLSC(converted, region_size, ratio);
            lsc->iterate(num_iterations);
            lsc->enforceLabelConnectivity(min_element_size);
            Mat result = src.clone();
            Mat labels;
            lsc->getLabels(labels);
            int num_superpixels = lsc->getNumberOfSuperpixels();
            int* cx = new int [num_superpixels];
            int* cy = new int [num_superpixels];
            int* area = new int [num_superpixels];
            memset(area, 0, num_superpixels * sizeof(int));
            for (int row = 0; row < labels.rows; row++) {
                for (int col = 0; col < labels.cols; col++) {
                    area[labels.at<int>(row, col)]++;
                }
            }
            
            for (int i = 0; i < num_superpixels; i++) {
                Mat curr_mask = (labels == i);
                Moments m = moments(curr_mask);
                cx[i] = (int)(m.m10 / m.m00);
                cy[i] = (int)(m.m01 / m.m00);
            }
            
            
            vector<Mat> transformation_stack;
            for (int i = 0; i < num_superpixels; i++) {
                transformation_stack.push_back(Mat::eye(3, 3, CV_64F));
            }
            
//            int num_keyframes;
//            fin >> num_keyframes;
//            cout << num_keyframes << endl;
            for (int i = 0; i < num_keyframes; i++) {
                int num_keyframe_segments;
                vector<int> matched_ids;
                fin >> num_keyframe_segments;
                for (int j = 0; j < num_keyframe_segments; j++) {
                    int cx_match, cy_match, area_match;
                    fin >> cx_match >> cy_match >> area_match;
                    int dist = 0x7FFFFFFF;
                    int matched_id = 0;
                    for (int k = 0; k < num_superpixels; k++) {
                        int curr_dist = abs(cx[k] - cx_match) + abs(cy[k] - cy_match) + abs(area[k] - area_match) / 1000;
                        if (curr_dist < dist) {
                            dist = curr_dist;
                            matched_id = k;
                        }
                    }
                    matched_ids.push_back(matched_id);
                }
                
                // Generate the current mask
                Mat curr_mask = Mat::zeros(labels.rows, labels.cols, CV_8U);
                for (int j = 0; j < matched_ids.size(); j++) {
                    Mat curr_segment = (labels == matched_ids[j]);
                    Mat transformed_segment;
                    Mat inv_matrix;
                    double inv_res = invert(transformation_stack[matched_ids[j]], inv_matrix);
                    if (inv_res == 0) {
                        cerr << "Cannot invert the matrix!" << endl;
                    }
                    warpPerspective(curr_segment, transformed_segment, inv_matrix, Size(labels.cols, labels.rows), WARP_INVERSE_MAP);
                    curr_mask = curr_mask | transformed_segment;
                }
                
                int animation_type;
                fin >> animation_type;
                if (animation_type == TRANSFORM2D || animation_type == TRANSFORM2D2) {
                    float tx, ty, r, duration;
                    fin >> tx >> ty >> r >> duration;
                    Moments m = moments(curr_mask, false);
                    Point2f mask_center(m.m10 / m.m00, m.m01 / m.m00);
                    
                    Mat transformation_mat = Mat::eye(3, 3, CV_64F);
                    Mat mat2x3 = getRotationMatrix2D(mask_center, r, 1);
                    mat2x3.at<double>(0, 2) += tx;
                    mat2x3.at<double>(1, 2) += ty;
                    transformation_mat.at<double>(0, 0) = mat2x3.at<double>(0, 0);
                    transformation_mat.at<double>(0, 1) = mat2x3.at<double>(0, 1);
                    transformation_mat.at<double>(0, 2) = mat2x3.at<double>(0, 2);
                    transformation_mat.at<double>(1, 0) = mat2x3.at<double>(1, 0);
                    transformation_mat.at<double>(1, 1) = mat2x3.at<double>(1, 1);
                    transformation_mat.at<double>(1, 2) = mat2x3.at<double>(1, 2);
                    
                    // Update transformation stack
                    for (int j = 0; j < matched_ids.size(); j++) {
                        transformation_stack[matched_ids[j]] = transformation_mat * transformation_stack[matched_ids[j]];
                    }
                } else if (animation_type == TRANSFORM3D || animation_type == TRANSFORM3D2) {
                    Point2f ptp[4], ptq[4];
                    float duration;
                    fin >> ptp[0].x >> ptp[0].y >> ptp[1].x >> ptp[1].y >> ptp[2].x >> ptp[2].y >> ptp[3].x >> ptp[3].y;
                    fin >> ptq[0].x >> ptq[0].y >> ptq[1].x >> ptq[1].y >> ptq[2].x >> ptq[2].y >> ptq[3].x >> ptq[3].y;
                    fin >> duration;
                    Mat perspective = getPerspectiveTransform(ptp, ptq);
                    
                    // Update transformation stack
                    for (int j = 0; j < matched_ids.size(); j++) {
                        transformation_stack[matched_ids[j]] = perspective * transformation_stack[matched_ids[j]];
                    }
                } else {
                    char animation_chars[256];
                    fin.getline(animation_chars, 256);
                }
                imwrite(directory + "mask_" + to_string(i) + ".png", curr_mask);
            }
            
            delete [] cx;
            delete [] cy;
            delete [] area;
            
            fin.close();
            
            Mat mask;
            lsc->getLabelContourMask(mask, false);
            result.setTo(Scalar(0, 0, 255), mask);
        }
    }
    
    return 0;
}

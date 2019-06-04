//
//  keyframe.cpp
//  QRCode-cpp
//
//  Created by wangzeyu on 10/28/17.
//  Copyright © 2017 wangzeyu. All rights reserved.
//

#include <fstream>
#include <iostream>
#include "keyframe.hpp"
#include "utils.hpp"
// #include "../Inpainting/image_inpainting.h" // Advanced inpainting disabled

vector<Keyframe*> decode_keyframes(string decoded_qr) {
    vector<Keyframe*> decoded_keyframes;
    ifstream fin(decoded_qr);
    if (!fin.is_open()) {
        cerr << "Decoded QR file doesn't exist!" << endl;
        return decoded_keyframes;
    }
    string landmarks;
    for (int i = 0; i < 8; i++) {
        fin >> landmarks;
    }
    float LSCparams;
    for (int i = 0; i < 4; i++) {
        fin >> LSCparams;
    }
    int num_keyframes;
    fin >> num_keyframes;
    for (int i = 0; i < num_keyframes; i++) {
        int num_segments;
        fin >> num_segments;
        if (num_segments == 0) {
            int num_vertices;
            fin >> num_vertices;
            for (int j = 0; j < num_vertices; j++) {
                int v_x, v_y;
                fin >> v_x >> v_y;
            }
        } else {
            for (int j = 0; j < num_segments; j++) {
                int c_x, c_y, area;
                fin >> c_x >> c_y >> area;
            }
        }
        
        int curr_type;
        fin >> curr_type;
        if (curr_type == TRANSFORM2D || curr_type == TRANSFORM2D2) {
            float translation_x, translation_y, rotation, duration;
            fin >> translation_x >> translation_y >> rotation >> duration;
            KeyframeTransform2D* curr_keyframe = new KeyframeTransform2D(translation_x, translation_y, rotation, duration, curr_type);
            decoded_keyframes.push_back(curr_keyframe);
        } else if (curr_type == TRANSFORM3D || curr_type == TRANSFORM3D2) {
            Point2f ptp[4], ptq[4];
            float duration;
            fin >> ptp[0].x >> ptp[0].y >> ptp[1].x >> ptp[1].y >> ptp[2].x >> ptp[2].y >> ptp[3].x >> ptp[3].y;
            fin >> ptq[0].x >> ptq[0].y >> ptq[1].x >> ptq[1].y >> ptq[2].x >> ptq[2].y >> ptq[3].x >> ptq[3].y;
            fin >> duration;
            KeyframeTransform3D* curr_keyframe = new KeyframeTransform3D(ptp, ptq, duration, curr_type);
            decoded_keyframes.push_back(curr_keyframe);
        } else if (curr_type == COLOR || curr_type == COLOR2) {
            float delta_hue, duration;
            fin >> delta_hue >> duration;
            KeyframeColor* curr_keyframe = new KeyframeColor(delta_hue, duration, curr_type);
            decoded_keyframes.push_back(curr_keyframe);
        } else {
            string annotation;
            float duration;
            fin >> annotation >> duration;
            KeyframeAnnotation* curr_keyframe = new KeyframeAnnotation(annotation, duration, curr_type);
            decoded_keyframes.push_back(curr_keyframe);
        }
    }
    fin.close();
    return decoded_keyframes;
}

void add_keyframe(Mat& old_inpainted, Mat& src, Keyframe* curr_keyframe_base, VideoWriter& vout, int keyframe_id, string directory, string mask_prefix) {
    bool is_load_old_inpainted = false;
    // Read masks from Python generated segmentation results
    Mat mask = imread(directory + mask_prefix + std::to_string(keyframe_id) + ".png");
    cvtColor(mask, mask, COLOR_BGR2GRAY);
    if (keyframe_id > 0) {
        Mat prev_mask = imread(directory + mask_prefix + std::to_string(keyframe_id - 1) + ".png");
        cvtColor(prev_mask, prev_mask, COLOR_BGR2GRAY);
        int curr_area = countNonZero(mask);
        int prev_area = countNonZero(prev_mask);
        int diff_area = countNonZero(mask - prev_mask);
        if (abs(curr_area - prev_area) < 10 && diff_area > 0) is_load_old_inpainted = true;
    }
    
    if (curr_keyframe_base->type == TRANSFORM2D || curr_keyframe_base->type == TRANSFORM2D2) {
        KeyframeTransform2D* curr_keyframe = static_cast<KeyframeTransform2D*>(curr_keyframe_base);
        
        // Apply the dilation operation
        int dilation_size = 2;
        Mat element = getStructuringElement(MORPH_ELLIPSE, Size(2 * dilation_size + 1, 2 * dilation_size + 1), Point(dilation_size, dilation_size));
        dilate(mask, mask, element);
        
        Mat inpainted = old_inpainted.clone();
        if (!is_load_old_inpainted) {
            // Advanced inpainting
//        string path_tmp_src = directory + "tmp_src.png";
//        string path_tmp_mask = directory + "tmp_mask.png";
//        string path_tmp_inpainted = directory + "tmp_inpainted.png";
//        imwrite(path_tmp_src, src);
//        imwrite(path_tmp_mask, mask);
//        inpaint_image_wrapper(path_tmp_src.c_str(), path_tmp_mask.c_str(), path_tmp_inpainted.c_str(), 7, 7, -1, true, false);
//        inpainted = imread(path_tmp_inpainted);
            // OpenCV inpainting
            inpaint(src, mask, inpainted, 3, INPAINT_TELEA);
            old_inpainted = inpainted;
        }
        
        // Compute the center of mask
        Moments m = moments(mask, false);
        Point2f mask_center(m.m10 / m.m00, m.m01 / m.m00);
        
        cvtColor(mask, mask, COLOR_GRAY2BGR);
        Mat ROI;
        multiply(src, mask, ROI, 1.0 / 255);

        // Apply 2D transformation
        for (int i = 0; i <= fps * curr_keyframe_base->duration; i++) {
            float curr_ratio = i / (float)(fps * curr_keyframe_base->duration);
            // Quadratic interpolation to produce the sense of acceleration
            if (curr_keyframe_base->type == TRANSFORM2D2) {
                curr_ratio *= i / (float)(fps * curr_keyframe_base->duration);
            }
            Mat transformation_mat = getRotationMatrix2D(mask_center, curr_ratio * curr_keyframe->rotation, 1);
            transformation_mat.at<double>(0, 2) += curr_ratio * curr_keyframe->translation_x;
            transformation_mat.at<double>(1, 2) += curr_ratio * curr_keyframe->translation_y;
            Mat transformation_mat_inv;
            invertAffineTransform(transformation_mat, transformation_mat_inv);
            
            Mat dst;
            warpAffine(ROI, dst, transformation_mat_inv, ROI.size(), WARP_INVERSE_MAP);
            Mat dst_mask;
            warpAffine(mask, dst_mask, transformation_mat_inv, mask.size(), WARP_INVERSE_MAP);
            cvtColor(dst_mask, dst_mask, COLOR_BGR2GRAY);
//            threshold(dst_mask, dst_mask, 0, 255, THRESH_BINARY); // Wrong way to get the current mask
            
            Mat neg_mask;
            bitwise_not(dst_mask, neg_mask);
            cvtColor(neg_mask, neg_mask, COLOR_GRAY2BGR);
            cvtColor(dst_mask, dst_mask, COLOR_GRAY2BGR);
            
            Mat neg_dst;
            multiply(inpainted, neg_mask, neg_dst, 1.0 / 255);
            addWeighted(dst, 1, neg_dst, 1, 0, dst);
//            imwrite("/Users/wangzeyu/Desktop/img_author_dst_" + to_string(i) + ".png", dst);
            vout.write(dst);
            // Update src image for processing the next keyframe
            if (i == fps * curr_keyframe_base->duration) src = dst;
        }
        
    } else if (curr_keyframe_base->type == TRANSFORM3D || curr_keyframe_base->type == TRANSFORM3D2) {
        KeyframeTransform3D* curr_keyframe = static_cast<KeyframeTransform3D*>(curr_keyframe_base);
        
        // Apply the dilation operation
        int dilation_size = 2;
        Mat element = getStructuringElement(MORPH_ELLIPSE, Size(2 * dilation_size + 1, 2 * dilation_size + 1), Point(dilation_size, dilation_size));
        dilate(mask, mask, element);
        
        Mat inpainted = old_inpainted.clone();
        if (!is_load_old_inpainted) {
            // OpenCV inpainting
            inpaint(src, mask, inpainted, 3, INPAINT_TELEA);
            old_inpainted = inpainted;
        }
        
        // Compute the center of mask
        Moments m = moments(mask, false);
        Point2f mask_center(m.m10 / m.m00, m.m01 / m.m00);
        
        cvtColor(mask, mask, COLOR_GRAY2BGR);
        Mat ROI;
        multiply(src, mask, ROI, 1.0 / 255);
        
        // Apply 3D transformation
        for (int i = 0; i <= fps * curr_keyframe_base->duration; i++) {
            float curr_ratio = i / (float)(fps * curr_keyframe_base->duration);
            // Quadratic interpolation to produce the sense of acceleration
            if (curr_keyframe_base->type == TRANSFORM2D2) {
                curr_ratio *= i / (float)(fps * curr_keyframe_base->duration);
            }
            
            Point2f curr_ptq[4] = {curr_keyframe->ptp[0] + (curr_keyframe->ptq[0] - curr_keyframe->ptp[0]) * curr_ratio, curr_keyframe->ptp[1] + (curr_keyframe->ptq[1] - curr_keyframe->ptp[1]) * curr_ratio, curr_keyframe->ptp[2] + (curr_keyframe->ptq[2] - curr_keyframe->ptp[2]) * curr_ratio, curr_keyframe->ptp[3] + (curr_keyframe->ptq[3] - curr_keyframe->ptp[3]) * curr_ratio};
            
            Mat perspective = getPerspectiveTransform(curr_keyframe->ptp, curr_ptq);
//            cout << perspective.at<double>(0, 0) << '\t' << perspective.at<double>(0, 1) << '\t' << perspective.at<double>(0, 2) << endl;
//            cout << perspective.at<double>(1, 0) << '\t' << perspective.at<double>(1, 1) << '\t' << perspective.at<double>(1, 2) << endl;
//            cout << perspective.at<double>(2, 0) << '\t' << perspective.at<double>(2, 1) << '\t' << perspective.at<double>(2, 2) << endl;
            Mat perspective_i;
            double inv_res = invert(perspective, perspective_i);
            if (inv_res == 0) {
                cerr << "Cannot invert the matrix!" << endl;
            }
//            cout << perspective_i.at<double>(0, 0) << '\t' << perspective_i.at<double>(0, 1) << '\t' << perspective_i.at<double>(0, 2) << endl;
//            cout << perspective_i.at<double>(1, 0) << '\t' << perspective_i.at<double>(1, 1) << '\t' << perspective_i.at<double>(1, 2) << endl;
//            cout << perspective_i.at<double>(2, 0) << '\t' << perspective_i.at<double>(2, 1) << '\t' << perspective_i.at<double>(2, 2) << endl;
            Mat dst;
            warpPerspective(ROI, dst, perspective_i, ROI.size(), WARP_INVERSE_MAP);
            Mat dst_mask;
            warpPerspective(mask, dst_mask, perspective_i, mask.size(), WARP_INVERSE_MAP);
            cvtColor(dst_mask, dst_mask, COLOR_BGR2GRAY);
//            threshold(dst_mask, dst_mask, 0, 255, THRESH_BINARY); // Wrong way to get the current mask
            
            Mat neg_mask;
            bitwise_not(dst_mask, neg_mask);
            cvtColor(neg_mask, neg_mask, COLOR_GRAY2BGR);
            cvtColor(dst_mask, dst_mask, COLOR_GRAY2BGR);
            
            Mat neg_dst;
            multiply(inpainted, neg_mask, neg_dst, 1.0 / 255);
            addWeighted(dst, 1, neg_dst, 1, 0, dst);
            vout.write(dst);
            // Update src image for processing the next keyframe
            if (i == fps * curr_keyframe_base->duration) src = dst;
        }
        
    } else if (curr_keyframe_base->type == COLOR || curr_keyframe_base->type == COLOR2) {
        KeyframeColor* curr_keyframe = static_cast<KeyframeColor*>(curr_keyframe_base);
        // Apply the dilation operation
//        int dilation_size = 2;
//        Mat element = getStructuringElement(MORPH_ELLIPSE, Size(2 * dilation_size + 1, 2 * dilation_size + 1), Point(dilation_size, dilation_size));
//        dilate(mask, mask, element);
        
        Mat src_hsv;
        cvtColor(src, src_hsv, CV_BGR2HSV);
        // Apply color transformation
        for (int i = 0; i <= fps * curr_keyframe_base->duration; i++) {
            float delta_hue_curr = curr_keyframe->delta_hue * i / (float)(fps * curr_keyframe_base->duration);
            // Quadratic interpolation
            if (curr_keyframe_base->type == COLOR2) {
                delta_hue_curr *= i / (float)(fps * curr_keyframe_base->duration);
            }
            Mat dst, dst_hsv = src_hsv.clone();
            for (int row = 0; row < dst_hsv.rows; row++) {
                for (int col = 0; col < dst_hsv.cols; col++) {
                    if (mask.at<uchar>(row, col) > 0) {
                        dst_hsv.at<Vec3b>(row, col)[0] = (uchar)(((int)dst_hsv.at<Vec3b>(row, col)[0] + (int)delta_hue_curr/2) % 180);
                    }
                }
            }
            cvtColor(dst_hsv, dst, COLOR_HSV2BGR);
//            imwrite("/Users/wangzeyu/Desktop/img_viewer_dst_" + to_string(i) + "_" + to_string(delta_hue_curr) + ".png", dst);
            vout.write(dst);
            // Update src image for processing the next keyframe
            if (i == fps * curr_keyframe_base->duration) src = dst;
        }
        
    } else if (curr_keyframe_base->type == ANNOTATION) {
        KeyframeAnnotation* curr_keyframe = static_cast<KeyframeAnnotation*>(curr_keyframe_base);
        // Apply the dilation operation
        int dilation_size = 10;
        Mat element = getStructuringElement(MORPH_ELLIPSE, Size(2 * dilation_size + 1, 2 * dilation_size + 1), Point(dilation_size, dilation_size));
        dilate(mask, mask, element);
        
        // Add red contour
        Mat contour;
        Canny(mask, contour, 100, 200);
        int dilation_size_c = 3;
        Mat element_c = getStructuringElement(MORPH_ELLIPSE, Size(2 * dilation_size_c + 1, 2 * dilation_size_c + 1), Point(dilation_size_c, dilation_size_c));
        dilate(contour, contour, element_c);
        
        Mat src_annotated = src.clone();
        bilateralFilter(src, src_annotated, 15, 80, 80);
        addWeighted(src_annotated, 0.7, src_annotated, 0, 0, src_annotated);
        for (int row = 0; row < src.rows; row++) {
            for (int col = 0; col < src.cols; col++) {
                if (mask.at<uchar>(row, col) > 0) {
                    src_annotated.at<Vec3b>(row, col) = src.at<Vec3b>(row, col);
                }
                if (contour.at<uchar>(row, col) > 0) {
                    src_annotated.at<Vec3b>(row, col)[0] = 0;
                    src_annotated.at<Vec3b>(row, col)[1] = 0;
                    src_annotated.at<Vec3b>(row, col)[2] = 255;
                }
            }
        }
        putText(src_annotated, curr_keyframe->annotation.c_str(), Point(20, 40), cv::FONT_HERSHEY_DUPLEX, 1.0, cv::Scalar(255, 255, 255), 1, CV_AA);
        for (int i = 0; i <= fps * curr_keyframe_base->duration; i++) {
            vout.write(src_annotated);
        }
    }
}
